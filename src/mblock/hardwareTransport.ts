/**
 * Hardware Communication & Upload Mode Broadcast Layer
 * Derived from Makeblock-official/mLink (socket port 55278 serialport router)
 * and The-Best-Codes/upload-mode-broadcast-mblock (OfflineBroadcast 0xFF 0x55 0x46 protocol)
 * plus browser-native WebSerial API (navigator.serial) for zero-install USB/UART telemetry.
 */

import { formatHexFrame } from './makeblockHardware.ts';

export type HardwareTransportMode = 'virtual_hil' | 'webserial' | 'mlink';

export interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

export interface NavigatorWithSerial extends Navigator {
  serial?: {
    requestPort(): Promise<SerialPortLike>;
  };
}

export const MLINK_BRIDGE_CONFIG = {
  socketUrl: 'http://127.0.0.1:55278',
  connectType: 'serialport',
  eventSend: 'c2s_send',
  eventVersion: 'check_mlink_version',
};

/**
 * Encodes a Makeblock Upload Mode Broadcast packet matching OfflineBroadcast.cpp:
 * [0xFF, 0x55, len, idx=0x00, action=0x01(GET), device=0x46(BROADCAST), type(1|2), nLen, ...msgBytes, (vLen, ...valBytes), 0x0D, 0x0A]
 */
export function encodeOfflineBroadcastFrame(msg: string, value?: string): number[] {
  const encoder = new TextEncoder();
  const msgBytes = Array.from(encoder.encode(msg.slice(0, 24)));
  const hasVal = value !== undefined && value !== '';
  const valBytes = hasVal ? Array.from(encoder.encode(String(value).slice(0, 24))) : [];

  if (msgBytes.length === 0) return [];

  const body: number[] = [
    0x00, // length placeholder (index 2 in full packet -> body.length)
    0x00, // idx
    0x01, // action = GET
    0x46, // device = BROADCAST (70)
    hasVal ? 0x02 : 0x01,
    msgBytes.length & 0xff,
    ...msgBytes,
  ];

  if (hasVal) {
    body.push(valBytes.length & 0xff, ...valBytes);
  }
  body[0] = body.length - 1;

  return [0xff, 0x55, ...body, 0x0d, 0x0a];
}

/**
 * Decodes an incoming Makeblock OfflineBroadcast packet (device 0x46).
 */
export function decodeOfflineBroadcastFrame(bytes: number[]): {
  valid: boolean;
  msg?: string;
  value?: string;
} {
  if (bytes.length < 9) return { valid: false };
  if (bytes[0] !== 0xff || bytes[1] !== 0x55) return { valid: false };
  if (bytes[4] !== 0x01 || bytes[5] !== 0x46) return { valid: false };

  const type = bytes[6];
  const nLen = bytes[7];
  if (8 + nLen > bytes.length) return { valid: false };
  const decoder = new TextDecoder();
  const msg = decoder.decode(new Uint8Array(bytes.slice(8, 8 + nLen)));

  if (type === 1) {
    return { valid: true, msg, value: '' };
  }
  if (type === 2 && 8 + nLen < bytes.length) {
    const vLen = bytes[8 + nLen];
    const vStart = 8 + nLen + 1;
    if (vStart + vLen <= bytes.length) {
      const value = decoder.decode(new Uint8Array(bytes.slice(vStart, vStart + vLen)));
      return { valid: true, msg, value };
    }
  }
  return { valid: false };
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean((navigator as NavigatorWithSerial).serial);
}

export function buildMLinkOpenRequest(portName: string, baudRate: number) {
  return {
    connectType: MLINK_BRIDGE_CONFIG.connectType,
    cmd: 'open',
    options: {
      port: portName,
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
    },
  };
}

export function buildMLinkWriteRequest(bytes: number[]) {
  return {
    connectType: MLINK_BRIDGE_CONFIG.connectType,
    cmd: 'write',
    data: bytes,
    hexPreview: formatHexFrame(bytes),
  };
}

export function generateOfflineBroadcastHeader(): string {
  return `/**
 * OfflineBroadcast.h — Протокол Upload Mode Broadcast (Makeblock mBlock 5)
 * Кадр: 0xFF 0x55 [len] [idx] [0x01 GET] [0x46 BROADCAST] [type] [nLen] [msg...]
 */
#ifndef OFFLINE_BROADCAST_H
#define OFFLINE_BROADCAST_H
#include <Arduino.h>

#define BROADCAST_DEVICE_ID 0x46
#define BROADCAST_ACTION_GET 0x01

class OfflineBroadcast {
public:
  String broadcastMsg = "";
  String broadcastValue = "";
  void loop();
  void broadcast(String msg);
  void broadcast(String msg, String value);
  void on(String msg, void (*callback)(void));
private:
  struct Listener { String msg; void (*callback)(void); };
  Listener listeners[8];
  int listenerCount = 0;
};
#endif
`;
}
