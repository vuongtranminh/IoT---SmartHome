export interface User {
  username: string;
  role: 'admin' | 'user';
}

export interface Sensors {
  temperature?: number;
  humidity?: number;
  gas?: number;
  light?: number;
  motion?: boolean;
}

export interface Devices {
  ac?: boolean;
  ac_temp?: number;
  ac_auto?: boolean;
  fan_speed?: number;
  fan_auto?: boolean;
  light_living?: boolean;
  light_living_auto?: boolean;
  light_bedroom?: boolean;
  door?: 'open' | 'closed';
  window?: 'open' | 'closed';
  fire_alarm?: boolean;
  alarm_manual?: boolean;
}

export interface Telemetry {
  timestamp?: string;
  device_id?: string;
  device_timestamp?: number;
  sensors?: Sensors;
  devices?: Devices;
}

export interface DeviceEvent {
  _id?: string;
  device_id?: string;
  event: string;
  detail?: string;
  received_at: string;
}

export interface AuditLogRow {
  _id: string;
  at: string;
  actor: string;
  action: string;
  target?: string;
  detail?: Record<string, unknown>;
  ip?: string;
  ok: boolean;
}
