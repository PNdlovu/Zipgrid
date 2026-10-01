/**
 * @file index.ts
 * @description Barrel export for OCPP 1.6J command dispatchers.
 * These functions wrap the raw OCPP Call/CallResult flow and return
 * typed result objects for use within the OCPP service.
 *
 * @module apps/ocpp-service/commands
 */

export { sendRemoteStart } from './RemoteStartTransaction'
export { sendRemoteStop } from './RemoteStopTransaction'
export { sendChangeAvailability } from './ChangeAvailability'
export { sendReset } from './Reset'
export { sendUnlockConnector } from './UnlockConnector'
export { changeConfiguration, pushDefaultConfiguration } from './ChangeConfiguration'

export type { RemoteStartParams, RemoteStartResult } from './RemoteStartTransaction'
export type { RemoteStopParams, RemoteStopResult } from './RemoteStopTransaction'
export type { ChangeAvailabilityParams, ChangeAvailabilityResult } from './ChangeAvailability'
export type { ResetType, ResetParams, ResetResult } from './Reset'
export type { UnlockConnectorParams, UnlockConnectorResult } from './UnlockConnector'
export type { ChangeConfigurationResult } from './ChangeConfiguration'
