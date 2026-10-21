# SUBMISSION_MATERIALS.md — Formal Report, Presentation Deck, Demo Script & Screenshot Guide

> **Project:** Interactive Data Link Layer Protocol Simulator  
> **Course:** Computer Networks (Semester V)  
> **Package Date:** 2026-10-21  
> **Status:** Submission-Ready Package (Phase 9 Final Hardening)

---

## 1. Formal Project Report Outline

```text
Title: Design, Mathematical Formalization, and Discrete-Event Implementation of an
       Interactive Data Link Layer Protocol Simulator
Course: Computer Networks (Semester V, Department of Computer Science & Engineering)
Author: CodeCrafter1319
Academic Year: 2026–2027
```

### Table of Contents
1. **Abstract**
   - Summary of project rationale: bridging the gap between theoretical Data Link Layer (Layer 2) equations and observable runtime behavior.
   - Core contributions: deterministic discrete-event scheduling engine (`SimulationEngine`), dual-experience architecture (Learning Playground + End-to-End Transmission Lab), mathematically rigorous implementation of Framing, Error Control, Sliding Window ARQ, and Ethernet CSMA/CD.
   - Verification summary: 171 automated unit and integration tests with zero external UI library dependencies.

2. **Introduction & Problem Statement**
   - Pedagogical challenges in learning Data Link Layer protocols (invisible bit-level framing, Galois field polynomial division, distributed sliding window edge cases, and temporal race conditions in carrier sensing).
   - Limitations of existing educational software (uncontrolled `setTimeout` race conditions, superficial CSS animations decoupled from state machines, and fragmented one-off calculators).
   - Project Objectives: mathematical correctness, complete decoupling of protocol logic from UI, deterministic virtual clock stepping, and examination-ready explainability.

3. **System Requirements & Technology Stack**
   - Functional Requirements:
     - Framing: HDLC Bit Stuffing, RFC 1662 PPP Byte Stuffing, Tanenbaum Character Count with desynchronization demonstration.
     - Error Detection: Modulo-2 division, CRC-8/SMBus, CRC-16/CCITT-FALSE, RFC 1071 16-bit Internet Checksum, 1D/2D Parity matrix.
     - Flow Control & ARQ: Stop-and-Wait ($m=1$), Go-Back-N ($W_s \le 2^m - 1$), Selective Repeat ($W_s, W_r \le 2^{m-1}$) with fault injection (Drop, Corrupt, Delay).
     - Medium Access Control: CSMA/CD on a linear multi-drop spatial bus with 1-persistent carrier sensing, bilateral propagation delay, collision detection ($2\tau$), 32-bit jam signals, and IEEE 802.3 Truncated BEB ($k \le 10$, attempt limit 16).
     - End-to-End Transmission Lab: 8-stage physical transmission pipeline integrating segmentation, header assembly, FCS, framing, channel propagation, deframing, FCS verification, and delivery.
   - Non-Functional Requirements:
     - Pure JavaScript core (`src/core/`) containing zero UI imports.
     - Zero heavy UI frameworks (Pure modular CSS).
     - Deterministic discrete-event simulation engine based on a priority queue.
     - Fast compilation and testing via Vite 6, React 19, and Vitest 3.

4. **Architectural Design & Methodology**
   - Architectural Decoupling: Pure Core Subsystems vs. React Presentation Components.
   - Discrete-Event Engine Architecture: `EventQueue` priority queue, virtual clock advancement, relative event scheduling, and clean timer cancellation.
   - Canonical Frame Contract & Binary Serialization (`FrameContract.js`): compact vs extended headers, wire byte extraction.
   - Multi-Layer Pipeline Coordinator (`TransmissionLabCoordinator.js`): 8-stage lifecycle tracking and state isolation.
   - Dual Simulation Profiles:
     - Profile A: Full-duplex point-to-point sliding window ARQ with interactive fault injection.
     - Profile B: Shared-medium Ethernet CSMA/CD bus contention without sliding-window ARQ.

5. **Algorithm Implementation & Mathematical Models**
   - Framing Transparency:
     - HDLC zero-insertion after five `1`s and abort sequence detection.
     - RFC 1662 PPP octet stuffing ($0\text{x}20$ bit-5 inversion) and `0x7D 0x7E` abort detection.
     - Character-count length prefixes and cascading desynchronization failure mechanics.
   - Error Control & Polynomial Division:
     - Galois field $\text{GF}(2)$ arithmetic, bitwise XOR long division, zero-padding.
     - CRC-8/SMBus (`0x07`, check `0xF4`) and CRC-16/CCITT-FALSE (`0x1021`, check `0x29B1`).
     - RFC 1071 16-bit 1's complement addition with odd zero-pad and end-around carry folding.
     - 1D parity vs. 2D parity matrix single-bit coordinate localization and 2-bit evasion.
   - Flow Control & ARQ State Machines:
     - Modulo $2^m$ circular window arithmetic (`sequenceMath.js`).
     - Stop-and-Wait ARQ state transitions, single timer, duplicate suppression.
     - Go-Back-N cumulative ACKs, single timer for oldest frame ($S_f$), full-window retransmission.
     - Selective Repeat independent frame timers, selective ACKs, receiver out-of-order buffering, selective retransmissions.
   - Medium Access Control:
     - Linear spatial bus model with bilateral propagation delay $\tau = d/c$.
     - Collision detection within collision window $2\tau$.
     - 32-bit jam signal broadcast.
     - Truncated Binary Exponential Backoff formula $k = \min(c, 10)$, slot selection $r \in [0, 2^k - 1]$, and exact attempt limit 16 abort.

6. **Verification, Testing & Performance Analysis**
   - Testing Methodology: Pure unit testing in Vitest prior to UI integration.
   - Test Vectors & Suites: 171 tests across 7 test suites (Sanity, Engine, Framing, Error Control, Flow Control, MAC, Transmission Lab).
   - Timing & Utilization Metrics:
     - Theoretical utilization vs discrete-event measured utilization ($T_t + 2T_p$).
     - Rigorous distinction: Channel Utilization ($U_{\text{channel}}$), Transmission Success Ratio ($S_{\text{tx}}$), Useful Utilization ($U_{\text{useful}}$), and Goodput ($G$).
   - Performance Footprint: Vite production bundle size (~132 kB gzipped), test duration (~2.4s).

7. **Educational Assumptions, Trade-Offs & Limitations**
   - Discrete virtual ticks vs continuous analog nanoseconds.
   - Deterministic fault injection matrices vs stochastic Gaussian channel noise.
   - Layer-2 focus: exclusion of TCP/IP transport/network routing and physical transceiver analog voltages.

8. **Conclusion & Future Work**
   - Summary of outcomes: a robust, 100% verified educational simulator suitable for university viva defense and laboratory curricula.
   - Potential extensions: CSMA/CA with RTS/CTS for wireless IEEE 802.11, HDLC bit-oriented supervisory frames, and sliding-window flow control over multi-hop topologies.

---

## 2. Presentation Slide Deck Outline (10–12 Slides)

### Slide 1: Title & Academic Metadata
- **Heading:** Interactive Data Link Layer Protocol Simulator
- **Sub-heading:** A Deterministic Discrete-Event Visualizer for Layer-2 Protocols
- **Details:** Computer Networks Innovative Assignment | Semester V | Department of CSE
- **Presenter:** CodeCrafter1319

### Slide 2: Problem Statement & Educational Motivation
- **The Challenge:** Data Link Layer operations (framing transparency, CRC modulo-2 division, sliding window buffer edge cases, and CSMA/CD collision detection) are taught via static textbook diagrams.
- **Flaws in Existing Tools:** Asynchronous `setTimeout` introduces race conditions; calculators provide static outputs without showing step-by-step state transitions.
- **Our Solution:** A deterministic discrete-event simulator where time advances in virtual ticks, combining an isolated Learning Playground with an integrated End-to-End Transmission Lab.

### Slide 3: System Architecture & Decoupling Principle
- **Decoupled Architecture:**
  - `src/core/`: 100% pure JavaScript ES modules (state machines, math, channels, engine). Zero UI code.
  - `src/ui/`: React 19 presentation layer that subscribes to simulation state snapshots.
  - `src/styles/`: Pure modular CSS (zero external UI dependencies).
- **Dual Experience Design:**
  - Experience 1: Learning Playground (Framing, Error Control, ARQ, CSMA/CD).
  - Experience 2: Flagship End-to-End Transmission Lab (8-stage multi-layer pipeline).

### Slide 4: Simulation Foundation — The Discrete-Event Engine
- **Why Not `setTimeout`?** JavaScript event loops have variable execution jitter, destroying reproducibility during examination.
- **Our Engine:**
  - Priority Queue (`EventQueue.js`) ordered by virtual integer ticks.
  - Simulation Engine (`SimulationEngine.js`): supports tick stepping, pausing, relative scheduling, and clean timer cancellation.
  - Duplex Channels (`Channel.js`): simulates propagation delay ($T_p$) and fault injection (`PASS`, `DROP`, `CORRUPT`, `DELAY`).

### Slide 5: Layer-2 Framing Transparency
- **HDLC Bit Stuffing:** Automatic zero insertion after five consecutive `1`s (`01111110` delimiter flag). Explicit detection of 7-one abort sequences.
- **RFC 1662 PPP Byte Stuffing:** Flag `0x7E`, escape `0x7D` with bit-5 inversion ($0\text{x}20$ XOR mask). Detection of RFC 1662 frame abort on `0x7D 0x7E`.
- **Character Count:** Total length prefix header and live demonstration of the **cascading desynchronization problem**.

### Slide 6: Error Detection & Mathematical Verification
- **Modulo-2 CRC:** Step-by-step bitwise XOR long division table for arbitrary polynomials.
- **Named Standards:**
  - `CRC-8/SMBus`: Poly $x^8+x^2+x+1$, verified check value `0xF4` for `"123456789"`.
  - `CRC-16/CCITT-FALSE`: Poly $x^{16}+x^{12}+x^5+1$, verified check value `0x29B1`.
- **Internet Checksum (RFC 1071):** 16-bit 1's complement addition with end-around carry folding; verified receiver sum `0xFFFF`.
- **2D Parity Matrix:** Interactive bit-cell toggling, single-bit coordinate localization $(x, y)$, and 2-bit evasion demonstration.

### Slide 7: Flow Control & Sliding Window ARQ
- **Stop-and-Wait ARQ:** 1-bit sequence space ($m=1, M=2$), single timer, duplicate suppression.
- **Go-Back-N ARQ:** Pipelined window $W_s \le 2^m - 1$, cumulative ACKs, single timer for oldest frame, full-window retransmission on timeout.
- **Selective Repeat ARQ:** Constrained windows $W_s, W_r \le 2^{m-1}$ ($W_s + W_r \le 2^m$), independent retransmission timers per frame, receiver out-of-order buffering, and selective retransmission of only lost frames.
- **Standardized Metrics:** Clear separation of Channel Utilization ($U_{\text{channel}}$), Success Ratio ($S_{\text{tx}}$), Useful Utilization ($U_{\text{useful}}$), and Goodput ($G$).

### Slide 8: Medium Access Control — CSMA/CD on Shared Bus
- **Physical Shared Medium:** Linear bus with 4 taps (Stations A, B, C, D) and bilateral propagation delay ($c = 200\,\text{m/\mu s}, \tau = 10\,\text{ticks}$).
- **1-Persistent Carrier Sensing:** Listen-before-talk local carrier sensing.
- **Collision Detection & Jamming:** Detection of colliding wavefronts within collision window $2\tau$; immediate abort and 32-bit jam signal (4 ticks) broadcast.
- **IEEE 802.3 Truncated BEB:** Exponent $k = \min(c, 10)$, random slot $r \in [0, 2^k - 1]$, and exact attempt limit 16 enforcement (`EXCESSIVE_COLLISIONS` discard).

### Slide 9: Flagship End-to-End Transmission Lab
- **The 8-Stage Transmission Pipeline:**
  1. Payload Segmentation $\to$ 2. Header Assembly $\to$ 3. FCS Encoding $\to$ 4. Framing Transparency $\to$ 5. Physical Channel $\to$ 6. Reception $\to$ 7. Deframing & FCS Verification $\to$ 8. Upper-Layer Delivery.
- **Dual Profiles:**
  - **Profile A (Point-to-Point ARQ):** Sliding window flow control over duplex channels with interactive fault injection.
  - **Profile B (Shared Ethernet):** 4-station bus contention with CSMA/CD, jam, and BEB without sliding-window ARQ.
- **Deep Frame Inspector:** Color-coded byte analysis (Cyan: Flags, Purple: Header, Green: Payload, Amber: FCS).

### Slide 10: Verification, Testing & Build Footprint
- **Automated Test Results:** **171 tests passed (100% green)** across 7 test suites in Vitest.
- **Production Bundle:** Vite 6 bundle compiled in ~3.4s; total gzipped footprint: 132 kB.
- **Dev Server Validation:** Tested and verified via HTTP probe (`HTTP 200 OK`).
- **Zero External Dependencies:** Built with pure React and standard CSS; no heavy component libraries.

### Slide 11: Viva Defense Highlights & Core Theoretical Insights
- **Key Exam Topics:**
  - Why $T_t \ge 2\tau$ is required for collision detection.
  - Why $W_s \le 2^m - 1$ in GBN and $W_s + W_r \le 2^m$ in SR.
  - Why CRC is mathematically superior to checksums against physical burst noise.
  - Why discrete-event simulation ensures 100% deterministic reproducibility.

### Slide 12: Conclusion & Future Work
- **Summary:** Successfully designed, implemented, and hardened a comprehensive educational simulator bridging theoretical network math and interactive visualization.
- **Key Takeaways:** Clean architectural decoupling, rigorous RFC/IEEE standard compliance, and university examination readiness.
- **Questions & Live Demo Invitation:** Open for examiner questions and interactive scenario demonstration.

---

## 3. Live Demonstration Script for University Presentation (5–7 Minutes)

### Introduction (0:00 – 1:00)
> *"Good morning, respected examiners. Today I am presenting our Computer Networks Innovative Assignment: an **Interactive Data Link Layer Protocol Simulator**.  
> The Data Link Layer is foundational to computer networking, governing framing, error detection, flow control, and medium access. However, students frequently struggle to visualize how these algorithms interact in a real transmission pipeline.  
> We built this simulator using pure JavaScript networking engines decoupled from a React 19 presentation layer. Most importantly, it uses a **deterministic discrete-event simulation engine** operating on virtual integer ticks—eliminating the race conditions of JavaScript `setTimeout` and ensuring 100% reproducible execution."*

### Part 1: Clean Transmission in the Flagship Lab (1:00 – 2:30)
> *"Let us start in our flagship mode: the **End-to-End Transmission Lab**.  
> Here, an upper-layer message travels through an authentic 8-stage physical transmission lifecycle.  
> I will load **Preset 1: Clean Transmission** using Stop-and-Wait ARQ with CRC-16 and RFC 1662 PPP Byte Stuffing.  
> As I click **Play**, watch the 8-stage breadcrumb tracker:  
> 1. Stage 1 chunks the message.  
> 2. Stage 2 formats the header with sequence number 0.  
> 3. Stage 3 computes the 16-bit CRC over header and payload.  
> 4. Stage 4 applies byte stuffing, escaping any reserved flag octets with `0x7D` and inverting bit 5.  
> 5. Stage 5 transmits the frame onto the forward channel.  
> 6. At virtual tick 4, the frame arrives at the receiver.  
> 7. In Stage 7, the receiver destuffs the bytes and recomputes the CRC-16 directly over the received wire bytes. The check passes!  
> 8. In Stage 8, the payload is delivered to the upper layer, and the receiver emits an acknowledgement (`ACK 1`) back to the sender.  
> As the ACK arrives at the sender, the sender's retransmission timer is cancelled, and the sender unblocks."*

### Part 2: Fault Injection & Bit Corruption Recovery (2:30 – 3:45)
> *"Now let us demonstrate what happens when physical channel noise corrupts a frame.  
> I load **Preset 2: Bit Corruption Recovery** using CRC-8.  
> On the forward channel, a bit flip occurs in transit.  
> Notice that when the corrupted frame reaches the receiver at Stage 7, the recomputed CRC does not match the received FCS. The receiver immediately logs an FCS mismatch error and discards the frame.  
> Because the frame was discarded, no ACK is sent.  
> The sender's retransmission timer counts down and expires at virtual tick 12.  
> The sender automatically retransmits the frame. On this second attempt, the frame arrives uncorrupted, passes the CRC check, and is delivered cleanly. Our live telemetry records exactly 2 attempts, 1 retransmission, 1 corruption, and a 50% transmission success ratio."*

### Part 3: ARQ Efficiency: Go-Back-N vs. Selective Repeat (3:45 – 4:45)
> *"Now let us examine the core trade-off in sliding-window flow control: Go-Back-N versus Selective Repeat.  
> In **Go-Back-N**, the receiver window size is strictly 1. If we send frames 0, 1, 2, 3 and drop frame 1 in transit, frames 2 and 3 are discarded by the receiver as out-of-order. When frame 1 times out, the sender must retransmit the entire outstanding window—frames 1, 2, and 3.  
> In contrast, in **Selective Repeat**, the receiver has an out-of-order buffer of size $W_r = 4$. When frame 1 is dropped, frames 2 and 3 are buffered at the receiver, and selective ACKs are returned. When frame 1 times out, the sender retransmits **only** frame 1. The moment frame 1 arrives, the receiver reassembles the batch in memory and delivers all frames in order."*

### Part 4: Shared-Medium Ethernet (CSMA/CD) & Backoff (4:45 – 5:45)
> *"Finally, let us switch to **Profile B: Shared-Medium Ethernet**.  
> Here, four stations (A, B, C, D) share a 300-meter linear coaxial bus with propagation speed $c = 200\,\text{m/\mu s}$ and one-way delay $\tau = 10\,\text{ticks}$.  
> I select **Preset 5: Contention & Backoff**. Stations A and D transmit simultaneously at $t=0$.  
> Because of propagation delay, both stations initially sense the medium idle. Their signals propagate and collide at mid-bus at $t=5$.  
> When the colliding wavefronts hit the station taps, both stations detect the collision within the round-trip collision window $2\tau = 20\,\text{ticks}$.  
> Immediately, both stations abort frame transmission and broadcast a **32-bit Jam Signal** for 4 ticks to ensure all stations detect the collision.  
> Both stations then enter **Truncated Binary Exponential Backoff**. For collision 1, the exponent is 1, choosing a random slot $r \in \{0, 1\}$. Station A draws slot 0; Station D draws slot 1.  
> Station A retransmits immediately, captures the bus, and delivers its frame cleanly to Station D—with zero invocation of sliding-window ARQ."*

### Conclusion & Q&A (5:45 – 6:00)
> *"The entire system is validated by **171 automated unit and integration tests** with 100% passing results, compiled into a clean 132 kB production bundle with zero external UI dependencies.  
> Thank you, and I look forward to your questions."*

---

## 4. Prioritized List of Final Screenshots to Capture

When preparing your final submission PDF or presentation slide deck, capture the following 6 screenshots from the running application:

### Screenshot 1: Flagship End-to-End Transmission Lab (Profile A Clean S&W)
- **Target URL:** `http://localhost:5173/` (Tab: `End-to-End Transmission Lab`)
- **Settings:** Profile: `Profile A (Point-to-Point ARQ)`, Preset: `1. Clean Transmission`, Input: `"DATA"`.
- **Capture Timing:** Run to completion ($t \ge 8$).
- **Key Visual Elements to Frame:**
  - The 8-Stage breadcrumb stepper showing all 8 badges highlighted in green.
  - The Live Telemetry row showing `Delivered: 1`, `Retransmissions: 0`, `Success Ratio: 100%`.
  - The Delivered Payloads box containing `"DATA"`.
  - The Color-Coded Frame Inspector showing the cyan flag bytes (`0x7E`), purple header (`0x00 0x04`), green payload (`0x44 0x41 0x54 0x41`), and amber CRC-16 (`0x29B1`).

### Screenshot 2: End-to-End Transmission Lab (Bit Corruption & Timeout Recovery)
- **Target URL:** `http://localhost:5173/` (Tab: `End-to-End Transmission Lab`)
- **Settings:** Profile: `Profile A`, Preset: `2. Bit Corruption Recovery (CRC-8)`.
- **Capture Timing:** Run simulation to virtual tick 16–20.
- **Key Visual Elements to Frame:**
  - Stage 7 displaying the red error badge: *"CRC / Checksum check failed: corrupted bits detected"*.
  - The Live Event Log showing the sequence of: `FORWARD_CHANNEL_TRANSMISSION`, `FCS_MISMATCH`, `TIMEOUT`, and subsequent `RETRANSMISSION_SUCCESS`.
  - Telemetry showing `Retransmissions: 1`, `Corruptions: 1`, `Timeouts: 1`.

### Screenshot 3: Flow Control (ARQ) Visualizer (Selective Repeat Out-of-Order Buffering)
- **Target URL:** `http://localhost:5173/` (Tab: `Flow Control & ARQ`)
- **Settings:** Protocol: `Selective Repeat`, Window Size: `4`, Frame Count: `4`.
- **Capture Timing:** Drop frame 1 in transit; let frames 2 and 3 arrive at receiver.
- **Key Visual Elements to Frame:**
  - Dual-lane channel visualizer showing in-flight packets.
  - Receiver sliding window showing frame 0 delivered (green), frame 1 missing (white/dashed), and frames 2 and 3 buffered (blue/striped).
  - Telemetry displaying individual frame timer indicators and active window bounds $[S_f, S_n)$ and $[R_f, R_f + W_r)$.

### Screenshot 4: CSMA/CD Bus Visualizer (Mid-Bus Wavefront Collision & Jamming)
- **Target URL:** `http://localhost:5173/` (Tab: `CSMA/CD Bus`)
- **Settings:** Preset: `Contention & Backoff (Stations A & D)`.
- **Capture Timing:** Pause at virtual tick 5–10 when wavefronts collide, or tick 12 when jam signals are emitted.
- **Key Visual Elements to Frame:**
  - The horizontal spatial bus rail with Stations A, B, C, D clearly labeled with their spatial meter coordinates ($0\,\text{m}, 100\,\text{m}, 200\,\text{m}, 300\,\text{m}$).
  - Opposing animated colored wavefronts overlapping with a red explosion/collision marker.
  - Station cards showing state: `TRANSMITTING_JAM` and backoff calculations ($k=1, r \in [0, 1]$).

### Screenshot 5: Error Control & CRC Visualizer (Step-by-Step XOR Long Division)
- **Target URL:** `http://localhost:5173/` (Tab: `Error Control & CRC`)
- **Settings:** Sub-tab: `Modulo-2 CRC`, Generator: `CRC-8 (x^8 + x^2 + x + 1)`, Payload: `"NET"`.
- **Key Visual Elements to Frame:**
  - The formatted Modulo-2 polynomial long division table displaying dividend zero-padding, intermediate XOR division rows, and remainder (FCS).
  - The 2D Parity Matrix grid showing row and column parity bits with single-bit coordinate localization.

### Screenshot 6: Framing Simulator (RFC 1662 PPP Byte Stuffing & Abort Sequence)
- **Target URL:** `http://localhost:5173/` (Tab: `Framing Simulator`)
- **Settings:** Sub-tab: `Byte Stuffing`, Mode: `RFC 1662 PPP`, Input containing `0x7E` and `0x7D 0x7E`.
- **Key Visual Elements to Frame:**
  - The visual stream comparison: Original Bytes vs. Stuffed Transmission Bytes vs. Destuffed Receiver Bytes.
  - The highlighted escape badges showing `0x7E` escaped to `0x7D 0x5E` ($0\text{x}20$ XOR mask) and the explicit warning for the `0x7D 0x7E` abort sequence.
