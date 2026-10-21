# VIVA_GUIDE.md — University Viva Defense & Technical Cheat Sheet

> **Project:** Interactive Data Link Layer Protocol Simulator  
> **Course:** Computer Networks (Semester V)  
> **Target:** External Examiners, Viva Voce Panels, and Technical Defense

---

## 1. Quick Reference: Essential Formulas

| Metric / Concept | Mathematical Formula | Variables & Constants |
| :--- | :--- | :--- |
| **Delay Ratio ($a$)** | $a = \frac{T_p}{T_t} = \frac{\tau}{T_t}$ | $T_p = \text{Propagation delay}$, $T_t = \text{Transmission duration}$ |
| **Stop-and-Wait Utilization** | $U_{\text{SW}} = \frac{T_t}{T_t + 2T_p} = \frac{1}{1 + 2a}$ | Assumes negligible processing and ACK transmission time |
| **Go-Back-N Utilization** | $U_{\text{GBN}} = \min\left(1, \frac{W_s \cdot T_t}{T_t + 2T_p}\right) = \min\left(1, \frac{W_s}{1 + 2a}\right)$ | $W_s \le 2^m - 1$ |
| **Selective Repeat Utilization** | $U_{\text{SR}} = \min\left(1, \frac{W_s}{1 + 2a}\right)$ | $W_s \le 2^{m-1}, W_r \le 2^{m-1}$ |
| **GBN Window Constraint** | $W_s \le 2^m - 1, \quad W_r = 1$ | $m = \text{Sequence bit-width}$ |
| **SR Window Constraint** | $W_s \le 2^{m-1}, \quad W_r \le 2^{m-1}, \quad W_s + W_r \le 2^m$ | Prevents receiver window ambiguity on wrap-around |
| **CSMA/CD Round-Trip Slot Time** | $T_{\text{slot}} = 2\tau = 2 \times \frac{d}{c}$ | $d = \text{Cable length}$, $c = \text{Propagation velocity}$ |
| **CSMA/CD Min Frame Size** | $T_t \ge 2\tau \implies L_{\min} \ge 2\tau \times R$ | $R = \text{Transmission data rate (bps)}$ |
| **Truncated BEB Exponent** | $k = \min(c, 10)$ | $c = \text{Collision count (1 to 16)}$ |
| **BEB Slot Selection** | $r \in [0, 2^k - 1], \quad \text{Delay} = r \times T_{\text{slot}}$ | Random uniform integer selection |
| **Internet Checksum Sum** | $\sum_{\text{all}} \text{Words} + \text{FCS} = 0\text{xFFFF}$ | RFC 1071 16-bit 1's complement addition |
| **Useful Utilization** | $U_{\text{useful}} = U_{\text{channel}} \times S_{\text{tx}}$ | $S_{\text{tx}} = \frac{\text{Delivered}}{\text{Total Attempts}}$ |

---

## 2. Core Theoretical Concepts

### 1. Data Link Layer Responsibilities
The Data Link Layer (Layer 2 of the OSI reference model) provides reliable, point-to-point or point-to-multipoint data transfer across an unshielded physical medium. Its principal duties are:
- **Framing:** Segmenting bitstreams into distinct identifiable units (frames) with clear boundary delimitation.
- **Error Control:** Detecting and recovering from bit-flipping, burst errors, and frame losses introduced by physical transmission channels.
- **Flow Control:** Preventing a fast transmitter from swamping a slow receiver through sliding-window flow control mechanisms.
- **Medium Access Control (MAC):** Managing shared physical media to resolve contention when multiple stations attempt concurrent transmission.

### 2. Framing Techniques Comparison
- **Bit Stuffing (HDLC):** Uses delimiter flag `01111110` (`0x7E`). The transmitter inserts a `0` after five consecutive `1`s in the payload. Destuffing removes the `0`. If 7 consecutive `1`s occur, an abort sequence is flagged.
- **Byte Stuffing (RFC 1662 PPP):** Uses flag `0x7E` and escape byte `0x7D`. In RFC 1662 mode, `0x7E` becomes `[0x7D, 0x5E]` and `0x7D` becomes `[0x7D, 0x5D]` ($0\text{x}20$ bit-5 inversion). The sequence `0x7D 0x7E` is defined as a frame abort.
- **Character Count (Tanenbaum):** The first byte indicates the total frame size (header + payload). Highly vulnerable: a single bit error in the length header causes catastrophic **cascading desynchronization**, misinterpreting payload bytes as frame boundaries.

### 3. Error Detection Algorithms
- **Cyclic Redundancy Check (CRC):** Treats bit sequences as polynomial coefficients over $\text{GF}(2)$. Modulo-2 long division computes the remainder (FCS). A generator polynomial of degree $r$ guarantees detection of all single-bit errors, all double-bit errors (if generator contains factor $(x+1)$), any odd number of errors, and all burst errors of length $\le r$.
- **16-bit Internet Checksum (RFC 1071):** Adds 16-bit words in 1's complement arithmetic, folding overflow carries back into the least significant bit, followed by bitwise negation. Computationally cheap (efficient in software) but mathematically weaker than CRC against byte reordering or equal-and-opposite bit shifts.
- **1D vs 2D Parity:** 1D parity has Hamming distance $d_{\min} = 2$ (detects single-bit errors; cannot detect 2-bit flips). 2D parity arranges bits in a matrix with row and column parity checks ($d_{\min} = 4$), enabling single-bit error localization and correction without retransmission, while detecting 2- and 3-bit errors.

---

## 3. Top 20 Examiner Viva Questions & Model Answers

### Q1: Why is Framing needed at Layer 2 if bits are already transmitted physically?
**Answer:** The physical layer transmits an unformatted, continuous stream of raw bits. The Data Link Layer must provide structure so that the receiver knows where each packet begins and ends, where headers and error-control fields reside, and which bits belong to which upper-layer protocol data unit.

### Q2: In HDLC Bit Stuffing, why does the transmitter stuff a '0' after five '1's rather than six '1's?
**Answer:** The reserved delimiter flag is `01111110` (six consecutive `1`s bounded by `0`s). If stuffing only occurred after six `1`s, a natural sequence of six `1`s in user data would collide with the delimiter flag and prematurely terminate the frame. Stuffing after five `1`s guarantees that user data can never produce six consecutive `1`s on the wire, reserving six consecutive `1`s exclusively for genuine frame boundaries.

### Q3: What happens in RFC 1662 PPP byte stuffing when the octet sequence [0x7D, 0x7E] is encountered?
**Answer:** In RFC 1662 Section 4.2, the escape octet `0x7D` followed immediately by the flag octet `0x7E` is defined as a **Frame Abort Sequence**. It indicates that the transmitter aborted transmission mid-frame or that channel noise corrupted an escaped byte into a closing flag. The receiver immediately discards all buffered data for that frame.

### Q4: Explain the cascading desynchronization vulnerability of Character-Count framing.
**Answer:** In character-count framing, the receiver relies entirely on the numerical value of the length header to calculate the memory offset of the next frame. If noise flips a bit in the length header (e.g., changing 5 to 7), the receiver reads two bytes beyond the frame boundary and misinterprets arbitrary payload bytes as the next frame's length header. This cascading error propagates indefinitely across subsequent frames.

### Q5: Why is CRC preferred over the Internet Checksum at Layer 2?
**Answer:** Layer 2 operates directly above the physical medium where noise often produces burst errors (consecutive corrupted bits). CRC is based on Galois field polynomial algebra; a degree-$r$ generator detects 100% of bursts up to $r$ bits. The Internet Checksum uses 1's complement addition, which is commutative and insensitive to bit transposition or byte reordering. Because Layer 2 is implemented in hardware (NIC ASICs), CRC's shift-register division runs at full wire speed with zero CPU penalty.

### Q6: What is the check value of an uncorrupted frame in CRC and RFC 1071 Checksum?
**Answer:**
- In standard CRC polynomial division (without inversion or non-zero init), dividing the intact codeword (Message + FCS) by the generator polynomial yields a **remainder of zero**. In named variants like CRC-8/SMBus or CRC-16/CCITT-FALSE, recomputing the FCS over the received payload and comparing it to the received FCS yields an exact match.
- In the 16-bit Internet Checksum (RFC 1071), summing all received words including the checksum word with end-around carry produces `0xFFFF` (negative zero in 1's complement).

### Q7: Why is the sender window size in Go-Back-N bounded by $W_s \le 2^m - 1$ instead of $2^m$?
**Answer:** If $W_s = 2^m$, the sender could transmit a full window of $2^m$ frames ($0$ through $2^m-1$). If all $2^m$ ACKs are lost in the reverse channel, the sender times out and retransmits frame $0$. The receiver, having received all $2^m$ frames, is now expecting sequence number $(0 + 2^m) \pmod{2^m} = 0$ of the *next* cycle. The receiver cannot distinguish whether the incoming frame $0$ is a duplicate of the previous batch or new data from the next batch. Limiting $W_s \le 2^m - 1$ ensures that the sender's window and the receiver's window never contain overlapping sequence numbers.

### Q8: Why must $W_s + W_r \le 2^m$ in Selective Repeat ARQ?
**Answer:** In Selective Repeat, the receiver has a window $W_r > 1$. If $W_s + W_r > 2^m$, the trailing edge of the receiver's current window and the leading edge of the receiver's advanced window overlap modulo $2^m$. If an entire window of ACKs is lost, the sender retransmits old frames which fall into the receiver's advanced acceptance window and are erroneously accepted as new frames. The standard symmetrical configuration sets $W_s = W_r = 2^{m-1}$.

### Q9: How do cumulative acknowledgements in Go-Back-N differ from selective acknowledgements?
**Answer:**
- In Go-Back-N, an ACK with sequence $k$ is **cumulative**: it confirms that all frames up to $k-1$ have been received correctly. If an intermediate ACK is lost, a subsequent ACK with a higher sequence number automatically acknowledges all earlier frames.
- In Selective Repeat, an ACK with sequence $k$ is **selective**: it confirms receipt of frame $k$ specifically. Lost ACKs require individual re-acknowledgement because ACKs do not implicitly acknowledge predecessors.

### Q10: Why does Go-Back-N discard out-of-order frames even if they arrive without bit errors?
**Answer:** Go-Back-N has a receiver window of size $W_r = 1$. The receiver maintains zero buffering capacity for out-of-order frames to minimize hardware buffer requirements. Discarding out-of-order frames forces the sender to retransmit from the oldest missing frame ($S_f$), guaranteeing that frames are delivered to the network layer in strict sequential order.

### Q11: What is the significance of the ratio $a = T_p / T_t$?
**Answer:** $a$ is the ratio of propagation delay to frame transmission duration.
- When $a \ll 1$ (short distance, low speed, large frames), transmission time dominates, and Stop-and-Wait achieves high utilization ($U \approx 1$).
- When $a \gg 1$ (long distance such as satellite links, or high data rates like 10Gbps Ethernet), propagation time dominates. The medium sits idle during round-trip propagation, making Stop-and-Wait highly inefficient ($U \approx 1/(1+2a)$) and necessitating pipelined sliding window protocols (GBN or SR) with large window sizes $W \ge 1 + 2a$.

### Q12: Why is carrier sensing alone (CSMA) insufficient to prevent collisions on a shared bus?
**Answer:** Signal propagation is bounded by the speed of light in the medium (typically $c \approx 200\,\text{m/\mu s} = 2 \times 10^8\,\text{m/s}$). A station at one end of the bus can begin transmitting while the bus is locally idle. Before the front of its signal reaches a distant station, that station also senses the bus locally idle and begins transmitting. The two signals collide in the medium during transit.

### Q13: State the fundamental CSMA/CD condition $T_t \ge 2\tau$ and explain its physical origin.
**Answer:**
$$T_t \ge 2\tau$$
Where $\tau = d/c$ is the maximum one-way propagation delay across the physical cable. In the worst-case scenario:
1. Station A begins transmitting at $t = 0$.
2. Just before the signal arrives at Station B at $t = \tau - \epsilon$, Station B begins transmitting.
3. The collision occurs immediately at Station B.
4. The collision signal (or corrupted waveform) takes another $\tau$ to travel back from Station B to Station A, arriving at $t = 2\tau - \epsilon$.
If Station A finishes transmitting before $t = 2\tau$, it will assume its frame was delivered cleanly before the collision notification arrives. Therefore, the frame transmission duration $T_t$ must be at least $2\tau$ so that the transmitter is still actively monitoring its tap when any collision wavefront returns.

### Q14: How does $T_t \ge 2\tau$ dictate the IEEE 802.3 Ethernet Minimum Frame Size (64 bytes)?
**Answer:** In original 10BASE5 Ethernet:
- Cable length $d \approx 2500\,\text{m}$ (via 4 repeaters) $\implies$ round-trip propagation $2\tau \approx 51.2\,\mu\text{s}$.
- Transmission rate $R = 10\,\text{Mbps}$.
- Minimum frame size $L_{\min} = 2\tau \times R = 51.2\,\mu\text{s} \times 10\,\text{Mbps} = 512\,\text{bits} = 64\,\text{bytes}$.
Any transmission shorter than 64 bytes is padded with extension bytes to guarantee collision detection before transmission ends. Collisions shorter than 64 bytes are recognized by receivers as collision fragments (runts) and discarded.

### Q15: What is the purpose of the 32-bit Jam Signal in CSMA/CD?
**Answer:** When a transmitting station detects a collision, the signal collision might be a tiny, high-frequency voltage transient that other stations might fail to recognize. The station immediately aborts frame transmission and broadcasts a 32-bit (4-octet) alternating bit pattern called a **Jam Signal**. This ensures sufficient energy on the medium for all other transmitting and listening stations to detect the collision reliably and enter backoff.

### Q16: Explain how IEEE 802.3 Truncated Binary Exponential Backoff (BEB) works.
**Answer:**
1. After collision $c$ (where $c = 1, 2, \dots$), the station sets exponent $k = \min(c, 10)$.
2. It picks a random integer $r$ uniformly distributed in the discrete interval $[0, 2^k - 1]$.
3. It delays retransmission by $r \times T_{\text{slot}}$, where $T_{\text{slot}} = 2\tau$ (one slot time).
4. After 10 collisions, the exponent is frozen at $k = 10$ ($r \in [0, 1023]$) to prevent delay from growing exponentially without bound (hence "Truncated").
5. If collisions reach the maximum attempt limit of 16 (1 initial attempt + 15 retries), the frame is aborted and discarded as `EXCESSIVE_COLLISIONS`.

### Q17: Why does BEB adaptively double the contention slot range after each collision?
**Answer:** If multiple stations collide, it indicates heavy channel congestion. If stations retried over a fixed small interval, they would repeatedly choose the same slots and collide again. Doubling the slot range $[0, 2^k - 1]$ dynamically reduces the probability of two stations choosing the identical slot ($\text{Probability} = 1/2^k$), allowing contention to resolve quickly during low traffic while stabilizing under heavy load.

### Q18: Distinguish between 1-persistent, non-persistent, and p-persistent CSMA.
**Answer:**
- **1-Persistent CSMA:** If channel is busy, station listens continuously until the medium becomes idle, then transmits immediately with probability 1. Highest throughput at low loads, but guaranteed collision if multiple stations are deferring.
- **Non-Persistent CSMA:** If channel is busy, station waits a random backoff delay before sensing again. Lower collision rate under heavy loads, but introduces medium idle time.
- **p-Persistent CSMA (Used in slotted channels):** If channel is idle, transmits with probability $p$; defers to next slot with probability $1-p$. Balances throughput and collision probability.

### Q19: Why does this simulator use a Discrete-Event Engine instead of JavaScript setTimeout?
**Answer:** In JavaScript, `setTimeout` and `setInterval` are placed in the browser's macro-task event queue and are executed asynchronously subject to CPU scheduling, browser rendering cycles, and background tab throttling. This introduces variable wall-clock jitter, causing race conditions in distributed protocol timers. A discrete-event engine maintains an explicit tick-ordered priority queue, advancing virtual time deterministically. This guarantees 100% reproducible execution traces, exact single-tick stepping, and zero race conditions during viva defense.

### Q20: What are the primary academic assumptions and limitations of this simulator?
**Answer:**
1. **Discrete Virtual Time:** Time progresses in integer ticks rather than continuous analog nanoseconds.
2. **Channel Fault Model:** Frame drops and bit corruptions are simulated via deterministic discrete fault matrices rather than stochastic signal attenuation, thermal noise, or multipath fading.
3. **Layer Scope:** The simulator models Layer 2 Data Link and MAC operations; it does not implement upper-layer TCP sliding windows, IP routing, or physical layer transceiver signaling voltages.
