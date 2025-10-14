import { z } from "zod";

export const signalingPeerSchema = z.object({
  peerId: z.string(),
  displayName: z.string(),
});

export const signalingPeersMessageSchema = z.object({
  type: z.literal("peers"),
  room: z.string(),
  peers: z.array(signalingPeerSchema),
});

export const signalingSignalMessageSchema = z.object({
  type: z.literal("signal"),
  from: z.string(),
  to: z.string(),
  data: z.unknown(),
});

export const signalingPeerJoinedSchema = z.object({
  type: z.literal("peer-joined"),
  peer: signalingPeerSchema,
});

export const signalingPeerLeftSchema = z.object({
  type: z.literal("peer-left"),
  peerId: z.string(),
});

export const signalingServerMessageSchema = z.discriminatedUnion("type", [
  signalingPeersMessageSchema,
  signalingSignalMessageSchema,
  signalingPeerJoinedSchema,
  signalingPeerLeftSchema,
]);

export type SignalingServerMessage = z.infer<typeof signalingServerMessageSchema>;
export type SignalingPeer = z.infer<typeof signalingPeerSchema>;

export const signalingJoinMessageSchema = z.object({
  type: z.literal("join"),
  room: z.string(),
  peerId: z.string(),
  displayName: z.string(),
});

export const signalingSignalPayloadSchema = z.object({
  type: z.literal("signal"),
  room: z.string(),
  from: z.string(),
  to: z.string(),
  data: z.unknown(),
});

export const signalingLeaveMessageSchema = z.object({
  type: z.literal("leave"),
  room: z.string(),
  peerId: z.string(),
});

export const signalingHeartbeatSchema = z.object({
  type: z.literal("heartbeat"),
  peerId: z.string(),
});

export type SignalingJoinMessage = z.infer<typeof signalingJoinMessageSchema>;
export type SignalingSignalPayload = z.infer<typeof signalingSignalPayloadSchema>;
export type SignalingLeaveMessage = z.infer<typeof signalingLeaveMessageSchema>;
export type SignalingHeartbeat = z.infer<typeof signalingHeartbeatSchema>;

export type SignalingClientMessage =
  | SignalingJoinMessage
  | SignalingSignalPayload
  | SignalingLeaveMessage
  | SignalingHeartbeat;
