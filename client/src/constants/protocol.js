export const GROUP_TAG = "maadehah-hania-rubban-se-2022"
export const PROTOCOL_VERSION = "cl-v2022"
export const PROTOCOL_NAME = "CipherLink-SecureChat-2022"

export const HKDF_INFO_SESSION = `${GROUP_TAG}/session-key/v1`
export const HKDF_INFO_FILE = `${GROUP_TAG}/file-key/v1`
export const HKDF_INFO_HANDSHAKE = `${GROUP_TAG}/handshake/v1`

export const AAD_MSG_PREFIX = `cl-msg-v2022|${GROUP_TAG}`
export const AAD_FILE_PREFIX = `cl-file-v2022|${GROUP_TAG}`
export const AAD_HANDSHAKE_PREFIX = `cl-hs-v2022|${GROUP_TAG}`