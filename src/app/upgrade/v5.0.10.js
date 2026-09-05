/**
 * Point the built-in demo connection at the host directory mounted into the
 * llm container.  Preserve a user's explicit custom Explorer path.
 */

const { dbAction } = require('../lib/db')
const { DEFAULT_EASYSSH_BOOKMARK_ID, DEFAULT_EASYSSH_BOOKMARK } = require('./default-easyssh-bookmark')
const { updateDBVersion } = require('./version-upgrade')

const VERSION_TO = '5.0.10'
const LEGACY_PATH = '/home/demo'

module.exports = async function updateDefaultLhgExplorerPath () {
  const bookmarks = await dbAction('bookmarks', 'find')
  const existing = bookmarks.find(bookmark => (
    bookmark._id === DEFAULT_EASYSSH_BOOKMARK_ID || (
      bookmark.host === DEFAULT_EASYSSH_BOOKMARK.host &&
      bookmark.port === DEFAULT_EASYSSH_BOOKMARK.port &&
      bookmark.username === DEFAULT_EASYSSH_BOOKMARK.username
    )
  ))
  if (existing && (!existing.easysshDefaultRemotePath || existing.easysshDefaultRemotePath === LEGACY_PATH)) {
    await dbAction('bookmarks', 'update', {
      _id: existing._id
    }, {
      $set: {
        easysshDefaultRemotePath: DEFAULT_EASYSSH_BOOKMARK.easysshDefaultRemotePath
      }
    })
  }
  await updateDBVersion(VERSION_TO)
}
