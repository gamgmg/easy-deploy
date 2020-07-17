module.exports = {
  publicPath: process.env.NODE_ENV === 'development' ? '/' : '',
  outputDir: 'dist',
  assetsDir: 'static',
  lintOnSave: process.env.NODE_ENV === 'development',
  productionSourceMap: false,
}