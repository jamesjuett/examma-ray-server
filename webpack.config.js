const path = require('path');

module.exports = {
  mode: "production",
  entry: {
    'index': './src/frontend/index',
    'staff': './src/frontend/staff',
    'participation': './src/frontend/participation',
    'dashboard': './src/frontend/dashboard',
    'manual-code-grader': './src/frontend/manual-code-grader',
    'manual-generic-grader': './src/frontend/manual-generic-grader',
  },
  output: {
    path: path.join(__dirname, '/public/js/'),
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
        test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[name].[ext]',
              outputPath: 'fonts/'
            }
          }
        ]
      }
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