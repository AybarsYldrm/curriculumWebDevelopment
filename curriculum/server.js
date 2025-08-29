'use strict';

const path = require('path');

const HttpService = require('./src/services/HttpService'); // module.exports = HttpService
const { AuthService } = require('./src/services/AuthService');
const { NoSQL } = require('./src/db/NoSQL');
const { PdfUtil} = require('./src/pdfUtil');
const { parse, execute } = require('./src/graphql');

(async () => {
  const db = new NoSQL(); // data/ altında users.json, events.json
  await db.init();

  const authService = new AuthService({ db });

  const http = new HttpService(authService, {
    publicPath: path.join(__dirname, 'public'),
    maxRequestsPerMinute: 200,
    uploadDefaultLimit: 10 * 1024 * 1024, // 10 MB
    uploadDefaultMaxKBps: 1024,
    allowedOrigins: ['http://localhost:8080']
  });

  const pdfUtil = new PdfUtil('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  // ---- GraphQL schema ----
  const schema = {
    Query: {
      // --- schema.Query içine ekle ---
      courses: {
        type: '[Course!]',
        // auth: false (herkese açık) - opsiyonel: auth: true ekleyebilirsin
        resolve: async (_p, { level }, { db }) => {
          // opsiyonel filtre: level (TYT/AYT)
          const filter = {};
          if (level) filter.level = level;
          const list = await db.find('courses', filter, { limit: 1000 });
          return list.map(c => ({ __type: 'Course', ...c }));
        }
      },

      course: {
        type: 'Course',
        resolve: async (_p, { id, code }, { db }) => {
          if (!id && !code) return null;
          // öncelik: id, sonra code
          if (id) {
            const doc = await db.findOne('courses', { id });
            return doc ? { __type: 'Course', ...doc } : null;
          }
          const doc = await db.findOne('courses', { code });
          return doc ? { __type: 'Course', ...doc } : null;
        }
      }
    },
    Mutation: {

    }
  };

  // ---- /graphql route (auth required) ----
  http.addRoute('POST', '/graphql', async (req, res) => {
    try {
      const { query, variables } = req.body || {};
      if (!query) return http.sendJson(res, 400, { error: 'query required' });

      // parse and execute
      const ast = parse(query);
      const result = await execute({
        schema,
        document: ast,
        variableValues: variables,
        contextValue: { db, req} // user injected for resolvers
      });

      // GraphQL responses are JSON objects -> send as JSON
      http.sendJson(res, 200, result);
    } catch (e) {
      http.sendJson(res, 400, { error: e.message });
    }
  }, { graph: true });

  // PdfUtil.convert için promise wrapper
function convertPdfAsync(htmlPath, pdfPath) {
  return new Promise((resolve, reject) => {
    pdfUtil.convert(htmlPath, pdfPath, (err, outPath) => {
      if (err) return reject(err);
      resolve(outPath);
    });
  });
}

http.addRoute('POST', '/program', async (req, res) => {
  if (!req.body || !req.body.files) {
    return http.sendJson(res, 400, { success: false, files: [] });
  }

  const files = req.body.files.map(f => ({
    field: f.fieldname,
    filename: f.filename,
    path: f.path
  }));

  const htmlFile = files[0];
  const pdfPath = path.join(__dirname, 'public', 'programs',
    `${path.basename(htmlFile.filename, '.html')}.pdf`
  );

  try {
    const outPath = await convertPdfAsync(htmlFile.path, pdfPath);

    // PDF hazır, JSON response gönder
    http.sendJson(res, 200, {
      success: true,
      htmlFile: htmlFile.filename,
      pdfFile: `/assets${outPath.split('public')[1].replace(/\\/g, '/')}`
    });

  } catch(err) {
    http.sendJson(res, 500, { success: false, error: err.message });
  }

}, {
  multipart: true,
  rateLimit: { windowMs: 10 * 1000, max: 1 },
  upload: {
    folder: 'programs',
    maxBytes: 0.1 * 1024 * 1024,
    accept: ['text/html'],
    naming: null
  }
});

  // ---- start server ----
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
  http.listen(port, () => console.log(`Server listening on ${port}`));
})();
