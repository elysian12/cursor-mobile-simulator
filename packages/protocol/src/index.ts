export type { SimulatorDevice, SimulatorDeviceState, SimulatorPlatform, ScreenInfo } from "./device.js";
export { ErrorCode } from "./errors.js";
export type { ProtocolError } from "./errors.js";
export type { RPCId, RPCRequest, RPCSuccess, RPCFailure, RPCResponse } from "./rpc.js";
export { isRPCFailure } from "./rpc.js";
export { Methods } from "./methods.js";
export type {
  MethodName,
  MethodMap,
  DeviceIdParams,
  SimulatorListParams,
  SimulatorListResult,
  SimulatorBootParams,
  SimulatorBootResult,
  SimulatorShutdownParams,
  SimulatorShutdownResult,
  SimulatorScreenshotParams,
  SimulatorScreenshotResult,
  SimulatorTapParams,
  SimulatorSwipeParams,
  SimulatorTypeParams,
  HardwareButtonName,
  SimulatorPressParams,
  SimulatorHomeParams,
  SimulatorHomeResult,
  SimulatorUiTreeParams,
  SimulatorUiTreeResult,
  SimulatorStreamParams,
  SimulatorStreamResult,
  HostAppAction,
  SimulatorHostParams,
  SimulatorHostResult,
  AppInstallParams,
  AppInstallResult,
  AppLaunchParams,
  AppLaunchResult,
  AppTerminateParams,
  AppTerminateResult,
  AppUninstallParams,
  AppUninstallResult,
} from "./methods.js";
export type { Session, SimulatorSession } from "./session.js";
export type {
  AgentActionName,
  AgentActionMessage,
  DeviceStatusMessage,
  ViewerStreamMode,
  GatewayConnectionState,
  ViewerHelloMessage,
  ViewerListMessage,
  ViewerAttachMessage,
  ViewerDetachMessage,
  ViewerRefreshMessage,
  ViewerWatchMessage,
  ViewerBootMessage,
  ViewerShowHostMessage,
  ControlTapMessage,
  ControlSwipeMessage,
  ControlHomeMessage,
  DeviceListMessage,
  StreamStatusMessage,
  ConnectionStateMessage,
  ControlResultMessage,
  HostStatusMessage,
  ViewerErrorMessage,
  FrameMetaMessage,
  WSClientMessage,
  WSServerMessage,
  WSMessage,
} from "./websocket.js";
export { parseWSMessage } from "./websocket.js";
export {
  FRAME_MAGIC,
  MEDIA_FRAME_VERSION,
  MEDIA_FRAME_HEADER_SIZE,
  MediaCodecId,
  MediaFrameSourceId,
  encodeMediaFrame,
  decodeMediaFrame,
} from "./frames.js";
export type { MediaCodecName, MediaFrameSource, MediaFrameHeader, DecodedMediaFrame } from "./frames.js";
export { PERMISSIONS_RELATIVE_PATH } from "./permissions.js";
export type { PermissionsFile } from "./permissions.js";
