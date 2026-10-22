/* My Fitness — BLE Heart Rate integration
   Standard Bluetooth Heart Rate Service (0x180D) / Measurement (0x2A37).
   No proprietary Crane/Workzone protocol is used.
*/
(() => {
  const HR_SERVICE = 0x180d;
  const HR_MEASUREMENT = 0x2a37;
  const SAMPLE_WINDOW_MS = 5000;
  const STARTING_HR_SAMPLES = 10;
  const RECOVERY_1_MS = 60000;
  const RECOVERY_2_MS = 120000;
  const STATE_PREFIX = "myFitness_hr_session_";
  const GRAPH_ZONE_LOW = 125;
  const GRAPH_ZONE_HIGH = 140;

  const el = id => document.getElementById(id);
  const fmtTime = seconds => {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  class HeartRateMonitor {
    constructor() {
      this.userId = null;
      this.device = null;
      this.server = null;
      this.characteristic = null;
      this.connected = false;
      this.mode = "idle"; // idle | starting | cardio | recovery | ready
      this.latestHR = 0;
      this.latestAt = 0;
      this.startingReadings = [];
      this.cardioStartAt = 0;
      this.cardioStartHR = 0;
      this.cardioEndHR = 0;
      this.rawReadings = [];
      this.graphSamples = [];
      this.bucketIndex = -1;
      this.bucketReadings = [];
      this.recoveryStartedAt = 0;
      this.recovery1HR = 0;
      this.recovery2HR = 0;
      this.timer = null;
      this.chart = null;
      this.wakeLock = null;
      this.persistTimer = null;
      this.lastVisibilityWarning = false;
    }

    setUser(userId) {
      this.userId = userId || null;
    }

    stateKey() {
      return STATE_PREFIX + (this.userId || "anonymous");
    }

    isSupported() {
      return !!navigator.bluetooth;
    }

    isSessionActive() {
      return ["starting", "cardio", "recovery", "ready"].includes(this.mode);
    }

    isReadyToSave() {
      return this.mode === "ready";
    }

    getSessionData() {
      if (!this.isSessionActive()) return null;
      return {
        startHR: this.cardioStartHR || 0,
        endHR: this.cardioEndHR || 0,
        graphSamples: this.graphSamples.map(x => ({ t: x.t, hr: x.hr })),
        recovery1HR: this.recovery1HR || 0,
        recovery2HR: this.recovery2HR || 0,
        rawCount: this.rawReadings.length
      };
    }

    async connect() {
      if (!this.isSupported()) {
        this.message("Web Bluetooth is not available in this browser. Use Chrome on Android over HTTPS.", "error");
        return;
      }
      try {
        this.setStatus("Selecting HR monitor…");
        const device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [HR_SERVICE] }]
        });
        this.device = device;
        this.device.addEventListener("gattserverdisconnected", () => this.onDisconnected());
        this.server = await device.gatt.connect();
        const service = await this.server.getPrimaryService(HR_SERVICE);
        this.characteristic = await service.getCharacteristic(HR_MEASUREMENT);
        this.characteristic.addEventListener("characteristicvaluechanged", e => this.handleMeasurement(e));
        await this.characteristic.startNotifications();
        this.connected = true;
        this.setStatus(`Connected${device.name ? ` • ${device.name}` : " • Heart-rate monitor"}`);
        this.updateUI();
      } catch (error) {
        console.error("BLE HR connection failed", error);
        this.connected = false;
        if (error?.name !== "NotFoundError") this.message(error?.message || "Could not connect to the HR monitor.", "error");
        this.setStatus("Not connected");
        this.updateUI();
      }
    }

    async disconnect() {
      try {
        if (this.characteristic) {
          try { await this.characteristic.stopNotifications(); } catch (_) {}
        }
        if (this.device?.gatt?.connected) this.device.gatt.disconnect();
      } finally {
        this.onDisconnected();
      }
    }

    onDisconnected() {
      this.connected = false;
      this.characteristic = null;
      this.server = null;
      if (this.mode === "cardio" || this.mode === "recovery" || this.mode === "starting") {
        this.message("HR monitor disconnected. Your recorded data remains on this device. Reconnect to continue HR capture.", "error");
      }
      this.setStatus("Disconnected");
      this.releaseWakeLock();
      this.updateUI();
    }

    parseMeasurement(dataView) {
      if (!dataView || dataView.byteLength < 2) return null;
      const flags = dataView.getUint8(0);
      const is16Bit = !!(flags & 0x01);
      const hr = is16Bit ? dataView.getUint16(1, true) : dataView.getUint8(1);
      return Number.isFinite(hr) && hr > 0 && hr < 260 ? hr : null;
    }

    handleMeasurement(event) {
      const hr = this.parseMeasurement(event.target.value);
      if (!hr) return;
      const at = Date.now();
      this.latestHR = hr;
      this.latestAt = at;

      if (this.mode === "starting") {
        this.startingReadings.push(hr);
        this.renderStarting();
        if (this.startingReadings.length >= STARTING_HR_SAMPLES) this.finishStartingHR();
      } else if (this.mode === "cardio") {
        this.recordCardioReading(hr, at);
      } else if (this.mode === "recovery") {
        this.handleRecoveryReading(hr, at);
      }

      this.renderLive();
    }

    async startStartingHR() {
      if (!this.connected) {
        this.message("Connect the HR monitor first.", "error");
        return;
      }
      if (this.isSessionActive()) {
        this.message("Finish or clear the current HR session before recording starting HR.", "error");
        return;
      }
      this.startingReadings = [];
      this.mode = "starting";
      this.message(`Collecting ${STARTING_HR_SAMPLES} HR readings…`, "success");
      this.updateUI();
    }

    finishStartingHR() {
      const values = this.startingReadings.slice(0, STARTING_HR_SAMPLES);
      const average = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      const input = el("preWorkoutHR");
      if (input) input.value = average;
      this.mode = "idle";
      this.startingReadings = [];
      if (el("startingHRStatus")) el("startingHRStatus").textContent = `${average} BPM`;
      this.message(`Starting HR: ${average} BPM (average of ${STARTING_HR_SAMPLES} readings).`, "success");
      this.updateUI();
      window.saveWorkoutDraft?.();
    }

    async startCardio() {
      if (!this.connected) {
        this.message("Connect the HR monitor before starting BLE cardio recording.", "error");
        return;
      }
      if (this.isSessionActive()) {
        this.message("An HR session is already active.", "error");
        return;
      }
      const cardioType = el("cardioType")?.value || "";
      if (!cardioType) {
        this.message("Select the cardio equipment first.", "error");
        return;
      }
      if (!this.latestHR || Date.now() - this.latestAt > 5000) {
        this.message("Wait for a current HR reading, then start cardio again.", "error");
        return;
      }
      this.mode = "cardio";
      this.cardioStartAt = Date.now();
      this.cardioStartHR = this.latestHR || 0;
      this.cardioEndHR = 0;
      this.rawReadings = [];
      this.graphSamples = [];
      this.bucketIndex = -1;
      this.bucketReadings = [];
      this.recoveryStartedAt = 0;
      this.recovery1HR = 0;
      this.recovery2HR = 0;
      this.lastVisibilityWarning = false;
      await this.requestWakeLock();
      this.startTimer();
      this.saveState();
      this.message("Cardio HR recording started.", "success");
      this.updateUI();
    }

    recordCardioReading(hr, at) {
      this.rawReadings.push({ t: at, hr });
      const elapsed = Math.max(0, at - this.cardioStartAt);
      const bucket = Math.floor(elapsed / SAMPLE_WINDOW_MS);
      if (this.bucketIndex === -1) this.bucketIndex = bucket;
      if (bucket !== this.bucketIndex) {
        this.finalizeBucket();
        this.bucketIndex = bucket;
        this.bucketReadings = [];
      }
      this.bucketReadings.push(hr);
      this.updateCardioStats();
      this.persistThrottled();
      this.renderHRChart();
    }

    finalizeBucket() {
      if (this.bucketIndex < 0 || !this.bucketReadings.length) return;
      const average = Math.round(this.bucketReadings.reduce((a, b) => a + b, 0) / this.bucketReadings.length);
      this.graphSamples.push({ t: this.bucketIndex * 5, hr: average });
      this.bucketReadings = [];
    }

    updateCardioStats() {
      const values = this.rawReadings.map(x => x.hr);
      const avg = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
      const max = values.length ? Math.max(...values) : 0;
      if (el("cardioAverageHR")) el("cardioAverageHR").value = avg || "";
      if (el("cardioPeakHR")) el("cardioPeakHR").value = max || "";
      if (el("cardioStartHR")) el("cardioStartHR").textContent = this.cardioStartHR ? `${this.cardioStartHR} BPM` : "—";
    }

    finishCardio() {
      if (this.mode !== "cardio") return;
      this.finalizeBucket();
      this.cardioEndHR = this.latestHR || 0;
      if (!this.cardioEndHR || Date.now() - this.latestAt > 5000) {
        this.message("No current HR reading is available for the cardio end. Keep the monitor connected and try again.", "error");
        return;
      }
      const elapsedMinutes = (Date.now() - this.cardioStartAt) / 60000;
      if (el("cardioMinutes")) el("cardioMinutes").value = elapsedMinutes.toFixed(1);
      this.recoveryStartedAt = Date.now();
      this.recovery1HR = 0;
      this.recovery2HR = 0;
      this.mode = "recovery";
      this.startTimer();
      this.saveState();
      this.message("Cardio finished. HR recovery is now measuring automatically for 2 minutes.", "success");
      this.updateUI();
    }

    handleRecoveryReading(hr, at) {
      const elapsed = at - this.recoveryStartedAt;
      if (!this.recovery1HR && elapsed >= RECOVERY_1_MS) {
        this.recovery1HR = hr;
        const recovery = Math.max(0, this.cardioEndHR - hr);
        if (el("hrRecovery")) el("hrRecovery").value = recovery;
        if (el("recovery1HR")) el("recovery1HR").textContent = `${hr} BPM`;
        if (el("recovery1Value")) el("recovery1Value").textContent = `${recovery} BPM`;
      }
      if (!this.recovery2HR && elapsed >= RECOVERY_2_MS) {
        this.recovery2HR = hr;
        const recovery = Math.max(0, this.cardioEndHR - hr);
        if (el("hrRecovery2")) el("hrRecovery2").value = recovery;
        if (el("recovery2HR")) el("recovery2HR").textContent = `${hr} BPM`;
        if (el("recovery2Value")) el("recovery2Value").textContent = `${recovery} BPM`;
        this.finishRecovery();
      }
      this.persistThrottled();
    }

    finishRecovery() {
      if (this.mode !== "recovery") return;
      this.mode = "ready";
      this.stopTimer();
      this.releaseWakeLock();
      this.saveState();
      this.message("2-minute recovery complete. Review the results, then press Save & Upload.", "success");
      this.updateUI();
    }

    startTimer() {
      this.stopTimer();
      this.timer = window.setInterval(() => {
        this.renderTimer();
        if (this.mode === "recovery") {
          const elapsed = Date.now() - this.recoveryStartedAt;
          if (elapsed >= RECOVERY_2_MS && this.recovery2HR) this.finishRecovery();
        }
      }, 250);
      this.renderTimer();
    }

    stopTimer() {
      if (this.timer) window.clearInterval(this.timer);
      this.timer = null;
    }

    renderTimer() {
      if (this.mode === "cardio") {
        const seconds = (Date.now() - this.cardioStartAt) / 1000;
        if (el("cardioElapsed")) el("cardioElapsed").textContent = fmtTime(seconds);
      } else if (this.mode === "recovery") {
        const elapsed = Math.min(120, (Date.now() - this.recoveryStartedAt) / 1000);
        const remaining = Math.max(0, 120 - elapsed);
        if (el("recoveryTimer")) el("recoveryTimer").textContent = `${fmtTime(remaining)} remaining`;
        if (el("recoveryProgress")) el("recoveryProgress").style.width = `${Math.min(100, elapsed / 120 * 100)}%`;
      }
    }

    renderLive() {
      if (el("liveHR")) el("liveHR").textContent = this.latestHR ? `${this.latestHR} BPM` : "—";
      if (el("liveHRCompact")) el("liveHRCompact").textContent = this.latestHR ? `${this.latestHR} BPM` : "—";
    }

    renderStarting() {
      const count = this.startingReadings.length;
      const box = el("startingHRStatus");
      if (!box) return;
      if (count < STARTING_HR_SAMPLES) {
        box.textContent = `Collecting… ${count}/${STARTING_HR_SAMPLES}`;
      }
    }

    setStatus(text) {
      const node = el("hrConnectionStatus");
      if (node) node.textContent = text;
    }

    message(text, type = "") {
      const node = el("hrMessage");
      if (!node) return;
      node.className = `message${type ? ` ${type}` : ""}`;
      node.textContent = text;
    }

    updateUI() {
      const supported = this.isSupported();
      const connect = el("connectHRBtn");
      const start = el("startCardioBtn");
      const finish = el("finishCardioBtn");
      const starting = el("recordStartingHRBtn");
      const save = el("saveWorkoutBtn");
      const statusDot = el("hrConnectionDot");
      if (connect) {
        connect.textContent = this.connected ? "Disconnect HR Monitor" : "Connect HR Monitor";
        connect.disabled = !supported;
      }
      if (statusDot) statusDot.classList.toggle("connected", this.connected);
      if (starting) starting.disabled = !this.connected || this.isSessionActive();
      if (start) start.disabled = !this.connected || this.isSessionActive();
      if (finish) finish.disabled = this.mode !== "cardio";
      if (save) {
        if (this.mode === "recovery") {
          save.disabled = true;
          save.textContent = "Recovery in progress…";
        } else if (this.mode === "ready") {
          save.disabled = false;
          save.textContent = "Save & Upload";
        } else {
          save.disabled = false;
          save.textContent = "Save Workout";
        }
      }
      const card = el("hrCardioPanel");
      if (card) card.dataset.mode = this.mode;
      this.renderLive();
      this.renderTimer();
      if (el("endHR")) el("endHR").textContent = this.cardioEndHR ? `${this.cardioEndHR} BPM` : "—";
      if (el("recovery1HR")) el("recovery1HR").textContent = this.recovery1HR ? `${this.recovery1HR} BPM` : "Waiting…";
      if (el("recovery2HR")) el("recovery2HR").textContent = this.recovery2HR ? `${this.recovery2HR} BPM` : "Waiting…";
      if (el("recovery1Value")) el("recovery1Value").textContent = this.recovery1HR ? `${Math.max(0, this.cardioEndHR - this.recovery1HR)} BPM` : "—";
      if (el("recovery2Value")) el("recovery2Value").textContent = this.recovery2HR ? `${Math.max(0, this.cardioEndHR - this.recovery2HR)} BPM` : "—";
      const values = this.rawReadings.map(x => x.hr);
      const avg = values.length ? Math.round(values.reduce((a,b) => a+b,0) / values.length) : 0;
      const max = values.length ? Math.max(...values) : 0;
      if (el("liveAverageHR")) el("liveAverageHR").textContent = avg ? `${avg} BPM` : "—";
      if (el("liveMaximumHR")) el("liveMaximumHR").textContent = max ? `${max} BPM` : "—";
      this.renderHRChart();
    }

    async requestWakeLock() {
      try {
        if ("wakeLock" in navigator) this.wakeLock = await navigator.wakeLock.request("screen");
      } catch (e) {
        console.info("Screen wake lock unavailable", e);
      }
    }

    releaseWakeLock() {
      try { this.wakeLock?.release?.(); } catch (_) {}
      this.wakeLock = null;
    }

    async handleVisibility() {
      if (document.visibilityState === "visible" && (this.mode === "cardio" || this.mode === "recovery")) {
        await this.requestWakeLock();
        if (!this.lastVisibilityWarning) {
          this.message("Keep this app visible during HR recording/recovery. Android may suspend Web Bluetooth while the screen is locked.", "error");
          this.lastVisibilityWarning = true;
        }
        if (this.mode === "recovery" && !this.recovery2HR && Date.now() - this.recoveryStartedAt > RECOVERY_2_MS + 10000) {
          this.message("The app was inactive past the 2-minute recovery point, so an exact 2-minute HR could not be captured. Reconnect the monitor and start a new cardio recovery measurement.", "error");
        }
      }
    }

    persistThrottled() {
      if (this.persistTimer) return;
      this.persistTimer = window.setTimeout(() => {
        this.persistTimer = null;
        this.saveState();
      }, 1000);
    }

    saveState() {
      if (!this.userId || !this.isSessionActive()) return;
      const state = {
        savedAt: Date.now(), mode: this.mode, cardioStartAt: this.cardioStartAt,
        cardioStartHR: this.cardioStartHR, cardioEndHR: this.cardioEndHR,
        rawReadings: this.rawReadings, graphSamples: this.graphSamples,
        bucketIndex: this.bucketIndex, bucketReadings: this.bucketReadings,
        recoveryStartedAt: this.recoveryStartedAt, recovery1HR: this.recovery1HR,
        recovery2HR: this.recovery2HR, latestHR: this.latestHR, latestAt: this.latestAt,
        cardioType: el("cardioType")?.value || ""
      };
      try { localStorage.setItem(this.stateKey(), JSON.stringify(state)); } catch (e) { console.warn("Could not persist HR session", e); }
    }

    restore() {
      if (!this.userId) return;
      let state = null;
      try { state = JSON.parse(localStorage.getItem(this.stateKey()) || "null"); } catch (_) {}
      if (!state || !["starting", "cardio", "recovery", "ready"].includes(state.mode)) return;
      this.mode = state.mode;
      this.cardioStartAt = Number(state.cardioStartAt) || 0;
      this.cardioStartHR = Number(state.cardioStartHR) || 0;
      this.cardioEndHR = Number(state.cardioEndHR) || 0;
      this.rawReadings = Array.isArray(state.rawReadings) ? state.rawReadings : [];
      this.graphSamples = Array.isArray(state.graphSamples) ? state.graphSamples : [];
      this.bucketIndex = Number.isFinite(state.bucketIndex) ? state.bucketIndex : -1;
      this.bucketReadings = Array.isArray(state.bucketReadings) ? state.bucketReadings : [];
      this.recoveryStartedAt = Number(state.recoveryStartedAt) || 0;
      this.recovery1HR = Number(state.recovery1HR) || 0;
      this.recovery2HR = Number(state.recovery2HR) || 0;
      this.latestHR = Number(state.latestHR) || 0;
      this.latestAt = Number(state.latestAt) || 0;
      if (state.cardioType) {
        const select = el("cardioType");
        if (select) select.value = state.cardioType;
      }
      if (this.cardioStartHR && el("cardioStartHR")) el("cardioStartHR").textContent = `${this.cardioStartHR} BPM`;
      if (this.cardioEndHR && el("endHR")) el("endHR").textContent = `${this.cardioEndHR} BPM`;
      if (this.recovery1HR && el("recovery1HR")) el("recovery1HR").textContent = `${this.recovery1HR} BPM`;
      if (this.recovery2HR && el("recovery2HR")) el("recovery2HR").textContent = `${this.recovery2HR} BPM`;
      if (this.recovery1HR && el("recovery1Value")) el("recovery1Value").textContent = `${Math.max(0, this.cardioEndHR - this.recovery1HR)} BPM`;
      if (this.recovery2HR && el("recovery2Value")) el("recovery2Value").textContent = `${Math.max(0, this.cardioEndHR - this.recovery2HR)} BPM`;
      if (this.mode === "cardio" || this.mode === "recovery") this.startTimer();
      this.updateUI();
      this.message("An unfinished HR session was restored from local storage. Reconnect the monitor to continue live HR capture.", "success");
    }

    clear() {
      this.stopTimer();
      this.releaseWakeLock();
      this.mode = "idle";
      this.startingReadings = [];
      this.cardioStartAt = 0;
      this.cardioStartHR = 0;
      this.cardioEndHR = 0;
      this.rawReadings = [];
      this.graphSamples = [];
      this.bucketIndex = -1;
      this.bucketReadings = [];
      this.recoveryStartedAt = 0;
      this.recovery1HR = 0;
      this.recovery2HR = 0;
      try { localStorage.removeItem(this.stateKey()); } catch (_) {}
      if (this.chart) { this.chart.destroy(); this.chart = null; }
      this.updateUI();
    }

    reset() {
      this.clear();
      this.device = null;
      this.characteristic = null;
      this.server = null;
      this.connected = false;
    }

    renderHRChart() {
      const canvas = el("hrLiveChart");
      if (!canvas || typeof Chart === "undefined") return;
      const visible = this.graphSamples.length || this.rawReadings.length;
      if (!visible && this.mode !== "cardio" && this.mode !== "recovery" && this.mode !== "ready") return;
      const points = this.graphSamples.map(x => ({ x: x.t, y: x.hr }));
      const data = points.length ? points : [];
      const zonePlugin = {
        id: "myFitnessHRZones",
        beforeDraw(chart) {
          const { ctx, chartArea, scales } = chart;
          if (!chartArea || !scales.y) return;
          const y = scales.y;
          const top = chartArea.top, bottom = chartArea.bottom;
          const clamp = px => Math.max(top, Math.min(bottom, px));
          const low = clamp(y.getPixelForValue(GRAPH_ZONE_LOW));
          const high = clamp(y.getPixelForValue(GRAPH_ZONE_HIGH));
          ctx.save();
          ctx.fillStyle = "rgba(148,163,184,0.07)";
          ctx.fillRect(chartArea.left, Math.min(low, bottom), chartArea.right-chartArea.left, Math.max(0, bottom-low));
          ctx.fillStyle = "rgba(34,197,94,0.10)";
          ctx.fillRect(chartArea.left, Math.min(high, low), chartArea.right-chartArea.left, Math.max(0, low-high));
          ctx.fillStyle = "rgba(239,68,68,0.06)";
          ctx.fillRect(chartArea.left, top, chartArea.right-chartArea.left, Math.max(0, high-top));
          ctx.restore();
        }
      };
      if (!this.chart) {
        this.chart = new Chart(canvas, {
          type: "line",
          data: {
            datasets: [{
              label: "Heart rate",
              data,
              parsing: false,
              borderColor: "#FF5D5D",
              backgroundColor: "rgba(255,93,93,0.12)",
              fill: true,
              tension: 0.35,
              borderWidth: 2.5,
              pointRadius: 0,
              pointHoverRadius: 5,
              spanGaps: false
            }]
          },
          plugins: [zonePlugin],
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: "nearest", intersect: false },
            scales: {
              x: { type: "linear", grid: { display: false }, title: { display: true, text: "Minutes" }, ticks: { callback: v => `${Math.round(v/60)}:${String(Math.round(v%60)).padStart(2,"0")}` } },
              y: { grid: { color: "rgba(255,255,255,0.14)", drawTicks: false }, title: { display: true, text: "BPM" }, suggestedMin: 80, suggestedMax: 160 }
            },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${Math.round(ctx.parsed.y)} BPM` } } }
          }
        });
      } else {
        this.chart.data.datasets[0].data = data;
        this.chart.update("none");
      }
    }
  }

  window.HeartRateMonitor = HeartRateMonitor;
  window.hrMonitor = new HeartRateMonitor();
  document.addEventListener("visibilitychange", () => window.hrMonitor.handleVisibility());
  window.addEventListener("beforeunload", () => window.hrMonitor.saveState());
})();
