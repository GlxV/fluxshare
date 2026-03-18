import { z } from "zod";

const MAX_ROOM_LENGTH = 64;
const MAX_PEER_ID_LENGTH = 64;
const MAX_DISPLAY_NAME_LENGTH = 80;

export const signalingPeerSchema = z.object({
  peerId: z.string().min(1).max(MAX_PEER_ID_LENGTH),
  displayName: z.string().min(1).max(MAX_DISPLAY_NAME_LENGTH),
});

export const signalingPeersMessageSchema = z.object({
  type: z.literal("peers"),
  room: z.string().min(1).max(MAX_ROOM_LENGTH),
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
  room: z.string().min(1).max(MAX_ROOM_LENGTH),
  peerId: z.string().min(1).max(MAX_PEER_ID_LENGTH),
  displayName: z.string().min(1).max(MAX_DISPLAY_NAME_LENGTH),
});

export const signalingSignalPayloadSchema = z.object({
  type: z.literal("signal"),
  room: z.string().min(1).max(MAX_ROOM_LENGTH),
  from: z.string().min(1).max(MAX_PEER_ID_LENGTH),
  to: z.string().min(1).max(MAX_PEER_ID_LENGTH),
  data: z.unknown(),
});

export const signalingLeaveMessageSchema = z.object({
  type: z.literal("leave"),
  room: z.string().min(1).max(MAX_ROOM_LENGTH),
  peerId: z.string().min(1).max(MAX_PEER_ID_LENGTH),
});

export const signalingHeartbeatSchema = z.object({
  type: z.literal("heartbeat"),
  peerId: z.string().min(1).max(MAX_PEER_ID_LENGTH),
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
