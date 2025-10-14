const DEFAULT_SIGNALING = "ws://localhost:5174/ws";
const DEFAULT_STUN = "stun:stun.l.google.com:19302";

type EnvConfig = {
  signalingUrl: string;
  iceServers: RTCIceServer[];
};

export function getEnv(): EnvConfig {
  const env = import.meta.env ?? {};
  const signalingUrl = (env.VITE_SIGNALING_URL as string | undefined) ?? DEFAULT_SIGNALING;
  const stun = (env.VITE_STUN_URL as string | undefined) ?? DEFAULT_STUN;
  const turnUrl = env.VITE_TURN_URL as string | undefined;
  const turnUser = env.VITE_TURN_USER as string | undefined;
  const turnPass = env.VITE_TURN_PASS as string | undefined;

  const iceServers: RTCIceServer[] = [{ urls: stun }];
  if (turnUrl && turnUser && turnPass) {
    iceServers.push({ urls: turnUrl, username: turnUser, credential: turnPass });
  }

  return {
    signalingUrl,
    iceServers,
  };
}
