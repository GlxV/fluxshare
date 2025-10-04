export interface SignalingMessage {
  type: "register" | "offer" | "answer" | "ice" | "bye";
  id?: string;
  from?: string;
  to?: string;
  sdp?: string;
  candidate?: unknown;
}

export class WebRTCClient {
  private ws?: WebSocket;
  private pc?: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private remoteId?: string;

  constructor(private signalingUrl: string, private selfId: string) {}

  connect() {
    this.ws = new WebSocket(this.signalingUrl);
    this.ws.addEventListener("open", () => {
      this.send({ type: "register", id: this.selfId });
    });
  }

  async createOffer(targetId: string) {
    this.remoteId = targetId;
    this.ensurePeerConnection();
    this.dc = this.pc!.createDataChannel("fluxshare", { ordered: true });
    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);
    this.send({ type: "offer", from: this.selfId, to: targetId, sdp: offer.sdp });
  }

  async handleOffer(message: SignalingMessage) {
    this.remoteId = message.from;
    this.ensurePeerConnection();
    await this.pc!.setRemoteDescription({ type: "offer", sdp: message.sdp! });
    const answer = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(answer);
    this.send({ type: "answer", from: this.selfId, to: message.from, sdp: answer.sdp });
  }

  async handleAnswer(message: SignalingMessage) {
    this.remoteId = message.from;
    await this.pc?.setRemoteDescription({ type: "answer", sdp: message.sdp! });
  }

  async handleIce(message: SignalingMessage) {
    if (message.candidate) {
      await this.pc?.addIceCandidate(message.candidate as RTCIceCandidateInit);
    }
  }

  private ensurePeerConnection() {
    if (this.pc) return;
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    this.pc.addEventListener("icecandidate", (ev) => {
      if (ev.candidate && this.remoteId) {
        this.send({
          type: "ice",
          from: this.selfId,
          to: this.remoteId,
          candidate: ev.candidate.toJSON(),
        });
      }
    });
  }

  private send(msg: SignalingMessage) {
    this.ws?.send(JSON.stringify(msg));
  }
}
