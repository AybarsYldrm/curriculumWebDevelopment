const { execFile } = require('child_process');
const path = require('path');

class PdfUtil {
  constructor(chromePath) {
    this.chromePath = chromePath; 
  }

  convert(htmlPath, pdfPath, callback) {
    if (!this.chromePath) {
      return callback(new Error("Chrome path not provided"));
    }

    const chromeArgs = [
      '--headless',
      '--disable-gpu',
      `--print-to-pdf=${pdfPath}`,
      htmlPath
    ];

    execFile(this.chromePath, chromeArgs, (err) => {
      if (err) return callback(err);
      callback(null, pdfPath);
    });
  }
}

// Örnek kullanım
module.exports = { PdfUtil };
