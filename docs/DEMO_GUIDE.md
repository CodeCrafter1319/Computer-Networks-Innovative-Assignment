# DEMO_GUIDE.md — Step-by-Step Live Viva Demonstration Script

> **Project:** Interactive Data Link Layer Protocol Simulator  
> **Course:** Computer Networks (Semester V)  
> **Audience:** University Examiners, Professors, and Peer Reviewers

---

## 1. Demonstration Preparation & Pre-Flight Checklist

### Environment Startup
1. Open PowerShell / Terminal in the project root:
   ```bash
   cd "c:/Users/lenovo/OneDrive/Desktop/College Innovative Assignments/SEM V/CN"
   ```
2. Verify all automated tests pass before beginning the presentation:
   ```bash
   pnpm test -- --run
   ```
   *Expected Output: 171 tests passed across 7 test suites (0 failed).*
3. Launch the development server:
   ```bash
   pnpm run dev
   ```
4. Open your browser to `http://localhost:5173/`.
5. Press `F12` to open Developer Tools and observe the console (confirm 0 errors).

---

## 2. Demo Scenario 1: Clean End-to-End Transmission (Stop-and-Wait)

### Objective
Demonstrate an uncorrupted payload traversing all 8 stages of the physical transmission pipeline from sender segmentation to receiver delivery, followed by reverse acknowledgement.

### Configuration
- **Active Tab:** `End-to-End Transmission Lab`
- **Active Profile:** `Profile A: Point-to-Point ARQ`
- **Preset:** Click **"1. Clean Transmission (Stop-and-Wait)"**
- **Payload Input:** `"DATA"`
- **Protocol:** `Stop-and-Wait ARQ`
- **FCS Algorithm:** `CRC-16/CCITT-FALSE`
- **Framing Scheme:** `Byte Stuffing (RFC 1662 PPP)`
- **Propagation Delay ($T_p$):** `3 virtual ticks`
- **Transmission Delay ($T_t$):** `1 virtual tick`
- **Timeout Duration:** `12 virtual ticks`

### Step-by-Step Execution
1. Click **"Reset Simulation"** to ensure virtual clock is at `t = 0`.
2. Click **"Step 1 Tick"** repeatedly (or click **"Play / Run"**):
   - **Tick 0:** Message `"DATA"` enters Stage 1 (Segmentation). Encoded into Frame `F0` (Seq: 0) with compact header (Stage 2). CRC-16 computed over header+payload (Stage 3). Byte-stuffed with `0x7E` delimiters (Stage 4). Injected into forward channel (Stage 5).
   - **Tick 1–3:** Frame `F0` traverses forward channel (in-flight animation).
   - **Tick 4:** Frame arrives at receiver (Stage 6). Destuffed; CRC-16 recomputed and verified valid (Stage 7). Payload `"DATA"` delivered to upper layer (Stage 8). Receiver emits `ACK 1` onto reverse channel.
   - **Tick 5–7:** `ACK 1` traverses reverse channel.
   - **Tick 8:** Sender receives `ACK 1`. Unacknowledges frame `F0`, cancels retransmission timer, transitions to `IDLE`, and unblocks for next transmission.

### Expected Metrics & Visual Outcomes
- **8-Stage Stepper:** All 8 badges light up in green (`PASS`).
- **Telemetry Card:**
  - `Delivered:` `1`
  - `Retransmissions:` `0`
  - `Corruptions:` `0`
  - `Timeouts:` `0`
  - `Success Ratio (Stx):` `100.0%`
  - `Channel Utilization (U):` `0.250` ($2 / 8$ busy ticks across duplex channels)
- **Delivered Payloads Box:** Contains `"DATA"`.
- **Frame Inspector:** Click on `F0` to show color-coded bytes:
  - Delimiter flags `0x7E` in Cyan.
  - Compact header `0x00 0x04` in Purple.
  - ASCII payload `"DATA"` (`0x44 0x41 0x54 0x41`) in Green.
  - Wire FCS `0x29B1` in Amber.

---

## 3. Demo Scenario 2: Bit Corruption Recovery (FCS Verification & Timeout)

### Objective
Demonstrate that physical channel bit corruption is detected by the receiver's FCS check, the corrupt frame is rejected, sender timer expires, and retransmission delivers the frame.

### Configuration
- **Active Tab:** `End-to-End Transmission Lab`
- **Active Profile:** `Profile A: Point-to-Point ARQ`
- **Preset:** Click **"2. Bit Corruption Recovery (CRC-8)"**
- **FCS Algorithm:** `CRC-8/SMBus`
- **Framing Scheme:** `HDLC Bit Stuffing`
- **Forward Channel Fault:** `CORRUPT` (selected automatically)

### Step-by-Step Execution
1. Click **"Reset Simulation"** (`t = 0`).
2. Click **"Play / Run"** with speed slider set to Medium:
   - **Attempt 1 (t = 0 to 4):**
     - Frame `F0` sent. Channel flips a physical bit on the wire (`corrupted: true`).
     - **Tick 4 (Receiver):** Frame arrives. Stage 7 destuffs stream and recomputes CRC-8. Recomputed CRC does **NOT** match wire FCS.
     - **Result:** Stage 7 displays alert: *"CRC / Checksum check failed: corrupted bits detected"*. Frame is discarded. Delivered counter remains `0`.
   - **Timeout (t = 12):**
     - Sender retransmission timer expires at $t = 12$. Live Event Log logs `TIMEOUT: Frame 0 timer expired after 12 ticks`.
   - **Attempt 2 (t = 12 to 16):**
     - Sender retransmits `F0`. Fault plan now allows `PASS`.
     - **Tick 16 (Receiver):** CRC-8 recomputation passes. Payload delivered to upper layer. `ACK 1` emitted.
   - **Tick 20:** Sender receives `ACK 1` and unblocks.

### Expected Metrics & Visual Outcomes
- **Telemetry Card:**
  - `Total Attempts:` `2`
  - `Delivered:` `1`
  - `Retransmissions:` `1`
  - `Corruptions Detected:` `1`
  - `Timeouts:` `1`
  - `Success Ratio (Stx):` `50.0%`
- **Live Event Log:** Shows initial corruption discard, followed by timeout warning, and final successful delivery.

---

## 4. Demo Scenario 3: Lost ACK Duplicate Suppression

### Objective
Demonstrate that when an ACK is dropped in the channel, sender timeout retransmission is correctly recognized as a duplicate by the receiver, preventing double-delivery while re-acknowledging.

### Configuration
- **Active Tab:** `End-to-End Transmission Lab`
- **Preset:** Click **"4. Lost ACK Duplicate Suppression"**
- **Protocol:** `Stop-and-Wait ARQ`
- **Reverse Channel Fault:** `DROP`

### Step-by-Step Execution
1. Click **"Play / Run"**:
   - Frame `F0` arrives at receiver at $t = 4$. Receiver delivers payload and emits `ACK 1`.
   - Reverse channel drops `ACK 1` at $t = 7$. Sender never receives acknowledgement.
   - Sender timer expires at $t = 12$. Sender retransmits `F0`.
   - Retransmitted `F0` arrives at receiver at $t = 16$.
   - **Receiver Duplicate Handling:** Receiver recognizes sequence `0` has already been delivered. It suppresses payload delivery (delivered array remains length 1) and re-emits `ACK 1`.
   - Sender receives 2nd `ACK 1` at $t = 20$ and successfully advances.

### Expected Metrics & Visual Outcomes
- **Delivered Payloads Box:** Contains exactly one copy of the payload (zero duplicates).
- **Telemetry Card:**
  - `Duplicates Suppressed:` `1`
  - `Timeouts:` `1`

---

## 5. Demo Scenario 4: ARQ Efficiency Comparison (Go-Back-N vs. Selective Repeat)

### Objective
Highlight the architectural and algorithmic difference between Go-Back-N (cumulative ACKs, full-window retransmission) and Selective Repeat (individual timers, out-of-order buffering, selective retransmission).

### Part A: Go-Back-N ($W_s=4, W_r=1$)
1. Switch to **Flow Control (ARQ)** tab (or select GBN in Transmission Lab).
2. Set Protocol: `Go-Back-N`, Window Size $W_s = 4$.
3. Send a 4-frame batch: `F0, F1, F2, F3`.
4. In transit, click **"Drop"** on Frame `F1`.
5. Observe:
   - `F0` is delivered; receiver emits `ACK 1`.
   - `F1` is lost.
   - `F2` and `F3` arrive at receiver, but because $W_r = 1$, receiver discards them with warning: *"Out-of-order frame discarded; expected F1"*.
   - Timer for `F1` expires.
   - Sender must retransmit **all unacknowledged frames**: `F1`, `F2`, and `F3` (3 retransmissions).

### Part B: Selective Repeat ($W_s=4, W_r=4$)
1. Set Protocol: `Selective Repeat`, $W_s = 4, W_r = 4$.
2. Send a 4-frame batch: `F0, F1, F2, F3`.
3. In transit, click **"Drop"** on Frame `F1`.
4. Observe:
   - `F0` is delivered.
   - `F1` is lost.
   - When `F2` and `F3` arrive, receiver does **NOT** discard them. It stores them in its out-of-order buffer and emits selective `ACK 2` and `ACK 3`.
   - Only the timer for `F1` expires.
   - Sender retransmits **ONLY Frame `F1`** (1 retransmission).
   - Upon `F1` arrival, receiver delivers `F1, F2, F3` as a continuous in-order batch to the upper layer.

---

## 6. Demo Scenario 5: CSMA/CD Contention, Jamming & Truncated BEB

### Objective
Demonstrate physical carrier sensing, overlapping wavefront collision within $2\tau$, 32-bit jam signal broadcast, and Truncated Binary Exponential Backoff contention resolution.

### Configuration
- **Active Tab:** `End-to-End Transmission Lab`
- **Active Profile:** `Profile B: Shared-Medium Ethernet`
- **Preset:** Click **"5. CSMA/CD Contention & Backoff"**
- **Bus Parameters:** Bus length $300\,\text{m}$, speed $c = 200\,\text{m/\mu s}$, $\tau = 10\,\text{ticks}$, $2\tau = 20\,\text{ticks}$, $T_t = 30\,\text{ticks}$, Jam = 4 ticks.

### Step-by-Step Execution
1. Click **"Reset Simulation"** (`t = 0`).
2. Click **"Play / Run"**:
   - **t = 0:** Station A ($0\,\text{m}$) and Station D ($300\,\text{m}$) both sense bus IDLE and begin transmitting simultaneously.
   - **t = 5:** Forward wavefront from Station A and reverse wavefront from Station D meet at mid-bus ($150\,\text{m}$).
   - **t = 10:** Wavefronts reach opposing stations. Local carrier sensing detects power above threshold (`COLLISION_DETECTED`).
   - **t = 10 to 14:** Both stations immediately abort frame transmission and transmit a **32-bit Jam Signal** (4 ticks) to enforce collision detection across the entire cable.
   - **t = 14:** Stations enter `BACKING_OFF` and compute Truncated BEB delay:
     - Collision count $c = 1 \implies k = \min(1, 10) = 1$.
     - Slot range: $r \in [0, 2^1 - 1] = \{0, 1\}$.
     - Slot time $T_{\text{slot}} = 2\tau = 20\,\text{ticks}$.
     - Station A chooses $r = 0$ (delays $0 \times 20 = 0\,\text{ticks}$).
     - Station D chooses $r = 1$ (delays $1 \times 20 = 20\,\text{ticks}$).
   - **Resolution:** Station A senses channel clear after jam clearing and retransmits immediately. By the time Station D finishes its backoff delay, Station A's transmission occupies the medium. Station D senses carrier and defers (`1-PERSISTENT` deferral).
   - **t = 54:** Station A's frame finishes transmission and departs Station D tap cleanly. Frame is marked **Delivered** at Station D.

### Expected Metrics & Visual Outcomes
- **Wavefront Visualizer:** Animated colored wavefronts colliding with red warning markers.
- **Telemetry Card:**
  - `Collisions:` `1`
  - `Jam Signals Emitted:` `2`
  - `Backoff Events:` `2`
  - `Total Delivered:` `1`
- **Protocol Separation Confirmation:** Shows `protocolInstance: null` (proves zero sliding-window ARQ invocation).

---

## 7. Interactive Playgrounds Highlight Tour (Quick Viva Checkpoints)

1. **Framing Playground (`/framing`):**
   - Click **Byte Stuffing**, enter payload with byte `0x7D` followed by `0x7E`.
   - Show how the receiver detects the **RFC 1662 abort sequence** and rejects the frame.
2. **Error Control Playground (`/error-control`):**
   - Click **Modulo-2 CRC**, select generator $x^4 + x + 1$ (`10011`).
   - Examine the live step-by-step XOR long division table.
   - Switch to **2D Parity Matrix**: click any bit cell in the interactive grid; observe the row parity and column parity update instantly to locate the exact $(x, y)$ coordinate of the single-bit error.
3. **CSMA/CD MAC Playground (`/mac`):**
   - Select preset **"Contention & Backoff"**.
   - Show the spatial physical bus rail with bilateral signal propagation and local station tap status cards.
