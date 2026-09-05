/**
 * Add the built-in demo lab connection to existing installations.
 * This is idempotent and never overwrites a user's existing matching bookmark.
 */

const { dbAction } = require('../lib/db')
const { DEFAULT_EASYSSH_BOOKMARK_ID, DEFAULT_EASYSSH_BOOKMARK } = require('./default-easyssh-bookmark')
const { updateDBVersion } = require('./version-upgrade')

const VERSION_TO = '5.0.9'

async function ensureDefaultBookmarkGroup (bookmarkId) {
  const groups = await dbAction('bookmarkGroups', 'find')
  const defaultGroup = groups.find(group => group._id === 'default')
  if (!defaultGroup) {
    await dbAction('bookmarkGroups', 'insert', {
      _id: 'default',
      title: 'default',
      bookmarkIds: [bookmarkId],
      bookmarkGroupIds: []
    })
    return
  }
  const bookmarkIds = Array.isArray(defaultGroup.bookmarkIds)
    ? defaultGroup.bookmarkIds
    : []
  if (!bookmarkIds.includes(bookmarkId)) {
    await dbAction('bookmarkGroups', 'update', {
      _id: 'default'
    }, {
      $set: {
        bookmarkIds: [...bookmarkIds, bookmarkId]
      }
    })
  }
}

module.exports = async function addDefaultEasysshBookmark () {
  const bookmarks = await dbAction('bookmarks', 'find')
  const existing = bookmarks.find(bookmark => (
    bookmark._id === DEFAULT_EASYSSH_BOOKMARK_ID || (
      bookmark.host === DEFAULT_EASYSSH_BOOKMARK.host &&
      bookmark.port === DEFAULT_EASYSSH_BOOKMARK.port &&
      bookmark.username === DEFAULT_EASYSSH_BOOKMARK.username
    )
  ))
  if (!existing) {
    await dbAction('bookmarks', 'insert', DEFAULT_EASYSSH_BOOKMARK)
  }
  await ensureDefaultBookmarkGroup(existing?._id || DEFAULT_EASYSSH_BOOKMARK_ID)
  await updateDBVersion(VERSION_TO)
}
