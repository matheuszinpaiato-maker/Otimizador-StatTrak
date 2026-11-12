function gerarBackend() {
  const sql = document.getElementById('sql-input').value.trim();
  if (!sql) {
    alert("Cole algum código SQL primeiro!");
    return;
  }

  // 1. Extrair nome do banco de dados
  const dbMatch = sql.match(/CREATE\s+DATABASE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z0-9_]+)`?/i);
  const dbName = dbMatch ? dbMatch[1] : 'meu_banco';

  // 2. Extrair tabelas e colunas
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z0-9_]+)`?\s*\(([\s\S]*?)\);/gi;
  const tabelas = [];
  let match;

  while ((match = tableRegex.exec(sql)) !== null) {
    const nomeTabela = match[1];
    const corpoTabela = match[2];

    const linhas = corpoTabela.split(',');
    const colunas = [];
    for (let linha of linhas) {
      linha = linha.trim();
      if (!linha || /^(PRIMARY|FOREIGN|KEY|CONSTRAINT|UNIQUE|INDEX)/i.test(linha)) continue;
      const colMatch = linha.match(/^`?([a-zA-Z0-9_]+)`?/);
      if (colMatch && colMatch[1].toLowerCase() !== 'id') {
        colunas.push(colMatch[1]);
      }
    }
    tabelas.push({ nome: nomeTabela, colunas });
  }

  if (tabelas.length === 0) {
    alert("Nenhuma instrução CREATE TABLE encontrada no SQL.");
    return;
  }

  // 3. Montar o conteúdo dos arquivos da estrutura do back-end
  const arquivos = {};

  arquivos['db/script.sql'] = sql;

  arquivos['src/db.js'] = `const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: '${dbName}'
});

module.exports = pool;`;

  let importsRoutes = `const express = require('express');\nconst router = express.Router();\n`;
  let registroRoutes = `\n`;

  // Estrutura base para o arquivo de exportação do Insomnia v4
  const insomniaResources = [];
  const workspaceId = "wrk_statTrakWorkspace";

  insomniaResources.push({
    _id: workspaceId,
    parentId: null,
    modified: Date.now(),
    created: Date.now(),
    name: `API ${dbName} - StatTrak`,
    description: "Coleção gerada automaticamente pelo Otimizador StatTrak",
    scope: "collection",
    _type: "workspace"
  });

  tabelas.forEach((tab, index) => {
    const cols = tab.colunas.join(', ');
    const placeholders = tab.colunas.map(() => '?').join(', ');
    const bodyVars = tab.colunas.join(', ');
    const updates = tab.colunas.map(c => `${c} = ?`).join(', ');

    arquivos[`src/controllers/${tab.nome}.js`] = `const db = require('../db');

const listar = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM ${tab.nome}');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
};

const criar = async (req, res) => {
  const { ${bodyVars} } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO ${tab.nome} (${cols}) VALUES (${placeholders})',
      [${bodyVars}]
    );
    res.status(201).json({ id: result.insertId, ...req.body });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
};

const atualizar = async (req, res) => {
  const { id } = req.params;
  const { ${bodyVars} } = req.body;
  try {
    await db.query(
      'UPDATE ${tab.nome} SET ${updates} WHERE id = ?',
      [${bodyVars ? bodyVars + ', ' : ''}id]
    );
    res.json({ mensagem: 'Atualizado com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
};

const deletar = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM ${tab.nome} WHERE id = ?', [id]);
    res.json({ mensagem: 'Removido com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
};

module.exports = { listar, criar, atualizar, deletar };`;

    importsRoutes += `const ${tab.nome}Controller = require('./controllers/${tab.nome}');\n`;
    registroRoutes += `router.get('/${tab.nome}', ${tab.nome}Controller.listar);\n`;
    registroRoutes += `router.post('/${tab.nome}', ${tab.nome}Controller.criar);\n`;
    registroRoutes += `router.put('/${tab.nome}/:id', ${tab.nome}Controller.atualizar);\n`;
    registroRoutes += `router.delete('/${tab.nome}/:id', ${tab.nome}Controller.deletar);\n\n`;

    // Gerador de mock JSON para o POST / PUT do Insomnia
    const mockObj = {};
    tab.colunas.forEach(c => { mockObj[c] = "valor_exemplo"; });

    const fldId = `fld_${tab.nome}_${index}`;
    insomniaResources.push({
      _id: fldId,
      parentId: workspaceId,
      modified: Date.now(),
      created: Date.now(),
      name: tab.nome.toUpperCase(),
      description: `Rotas CRUD para a tabela ${tab.nome}`,
      environment: {},
      environmentPropertyOrder: null,
      metaSortKey: -1000 * (index + 1),
      _type: "request_group"
    });

    // 1. GET (Listar)
    insomniaResources.push({
      _id: `req_get_${tab.nome}`,
      parentId: fldId,
      modified: Date.now(),
      created: Date.now(),
      url: `http://localhost:3000/${tab.nome}`,
      name: `Listar ${tab.nome}`,
      method: "GET",
      body: {},
      parameters: [],
      headers: [],
      authentication: {},
      metaSortKey: -1,
      _type: "request"
    });

    // 2. POST (Criar)
    insomniaResources.push({
      _id: `req_post_${tab.nome}`,
      parentId: fldId,
      modified: Date.now(),
      created: Date.now(),
      url: `http://localhost:3000/${tab.nome}`,
      name: `Criar ${tab.nome}`,
      method: "POST",
      body: {
        mimeType: "application/json",
        text: JSON.stringify(mockObj, null, 2)
      },
      parameters: [],
      headers: [{ name: "Content-Type", value: "application/json" }],
      authentication: {},
      metaSortKey: -2,
      _type: "request"
    });

    // 3. PUT (Atualizar)
    insomniaResources.push({
      _id: `req_put_${tab.nome}`,
      parentId: fldId,
      modified: Date.now(),
      created: Date.now(),
      url: `http://localhost:3000/${tab.nome}/1`,
      name: `Atualizar ${tab.nome}`,
      method: "PUT",
      body: {
        mimeType: "application/json",
        text: JSON.stringify(mockObj, null, 2)
      },
      parameters: [],
      headers: [{ name: "Content-Type", value: "application/json" }],
      authentication: {},
      metaSortKey: -3,
      _type: "request"
    });

    // 4. DELETE (Deletar)
    insomniaResources.push({
      _id: `req_del_${tab.nome}`,
      parentId: fldId,
      modified: Date.now(),
      created: Date.now(),
      url: `http://localhost:3000/${tab.nome}/1`,
      name: `Deletar ${tab.nome}`,
      method: "DELETE",
      body: {},
      parameters: [],
      headers: [],
      authentication: {},
      metaSortKey: -4,
      _type: "request"
    });
  });

  arquivos['src/routes.js'] = importsRoutes + registroRoutes + `module.exports = router;`;

  arquivos['server.js'] = `const express = require('express');
const cors = require('cors');
const routes = require('./src/routes');

const app = express();
app.use(cors());
app.use(express.json());
app.use(routes);

app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});`;

  arquivos['.gitignore'] = `node_modules\npackage-lock.json`;

  // Cria arquivo insomnia.json na raiz do projeto
  const insomniaData = {
    _type: "export",
    __export_format: 4,
    __export_date: new Date().toISOString(),
    __export_source: "Otimizador StatTrak v1.0",
    resources: insomniaResources
  };
  arquivos['insomnia.json'] = JSON.stringify(insomniaData, null, 2);

  // 4. Montar comando para o terminal
  let psCommand = `mkdir db, src, src\\controllers -Force | Out-Null; `;
  psCommand += `npm init -y | Out-Null; `;

  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    const base64 = btoa(unescape(encodeURIComponent(conteudo)));
    psCommand += `[IO.File]::WriteAllBytes("$PWD\\${caminho.replace(/\//g, '\\')}", [Convert]::FromBase64String("${base64}")); `;
  }

  psCommand += `npm pkg set scripts.start="node server.js"; `;
  psCommand += `npm pkg set scripts.dev="node --watch server.js"; `;
  psCommand += `npm install express cors mysql2; `;
  psCommand += `Write-Host "Back-end e Insomnia gerados com sucesso! Rode 'npm run dev' para iniciar." -ForegroundColor Green`;

  document.getElementById('terminal-output').textContent = psCommand;
  document.getElementById('output-section').style.display = 'flex';
}

function copiarComando() {
  const texto = document.getElementById('terminal-output').textContent;
  navigator.clipboard.writeText(texto);
  const btn = document.getElementById('btn-copy');
  btn.textContent = "Copiado!";
  setTimeout(() => btn.textContent = "Copiar Comando", 2000);
}