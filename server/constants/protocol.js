exports.GROUP_TAG = "maadehah-hania-rubban-se-2022"
exports.PROTOCOL_VERSION = "cl-v2022"
exports.PROTOCOL_NAME = "CipherLink-SecureChat-2022"

exports.HKDF_INFO_SESSION = `${exports.GROUP_TAG}/session-key/v1`
exports.HKDF_INFO_FILE = `${exports.GROUP_TAG}/file-key/v1`
exports.HKDF_INFO_HANDSHAKE = `${exports.GROUP_TAG}/handshake/v1`

exports.AAD_MSG_PREFIX = `cl-msg-v2022|${exports.GROUP_TAG}`
exports.AAD_FILE_PREFIX = `cl-file-v2022|${exports.GROUP_TAG}`