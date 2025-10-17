const path = require('path');

module.exports = {
  mode: "production",
  entry: {
    'public/js/index': './src/frontend/index',
    'staff/js/staff': './src/frontend/staff',
    'staff/js/courses': './src/frontend/courses',
    'staff/js/participation': './src/frontend/participation',
    'staff/js/dashboard': './src/frontend/dashboard',
    'staff/js/live_submission': './src/frontend/live_submission',
    'staff/js/manual-code-grader': './src/frontend/manual-code-grader',
    'staff/js/manual-generic-grader': './src/frontend/manual-generic-grader',
    'staff/js/fitb-drop-grader': './src/frontend/fitb-drop-grader',
  },
  output: {
    path: path.join(__dirname, '/'),
    filename: '[name].js',
    libraryTarget: 'umd',
    library: 'ExammaRay',
    umdNamedDefine: true,
    publicPath: ""
  },
  optimization: {
    minimize: false,
    // minimizer: [
    //   new TerserPlugin({
    //     terserOptions: {
    //       safari10: true
    //     },
    //   }),
    // ],
  },
  // devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader']
      },
      { // Need this because animal-avatar-generator doesn't fully specify extensions
        test: /\.m?js$/, // Match JavaScript and MJS files
        resolve: {
          fullySpecified: false, // This is the key setting to add
        },
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'fonts/[name][ext]',
        },
      },
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      handlebars: 'handlebars/dist/handlebars.min.js'
    },
    fallback: {
      "path": require.resolve("path-browserify")
    }
  }
};