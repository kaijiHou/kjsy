module.exports = (app) => {
  const express = require('express')
  const path = require('path')

  return new Promise((resolve) => {
    const assetsPath = path.resolve(__dirname, '../assets')
    const conf = {
      // 本地资源服务器：不缓存（bundle 文件名固定带版本号，1 年 maxAge 曾导致
      // Electron HTTP cache 长期命中旧 bundle——用户可见旧品牌/旧 UI 的根因）
      maxAge: 0,
      etag: false
    }

    // Handle _temp_*.css files - return empty CSS to prevent MIME type errors
    app.use((req, res, next) => {
      if (req.url.startsWith('/css/_temp_') && req.url.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css')
        res.send('')
        return
      }
      next()
    })

    app.use(
      express.static(assetsPath, conf)
    )
  })
}
