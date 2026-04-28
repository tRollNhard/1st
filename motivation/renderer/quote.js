const { motivation } = window;

const views = { loading: 'loadingView', prompt: 'promptView', error: 'errorView' };
let data = null;

function show(name) {
  Object.values(views).forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById(views[name]).classList.remove('hidden');
}

(async () => {
  const result = await motivation.researchQuote();
  if (result.error) {
    document.getElementById('errorMsg').textContent = result.error;
    show('error'); return;
  }
  data = result;
  document.getElementById('quoteText').textContent = `"${result.text}"`;
  document.getElementById('quoteAuthor').textContent = result.author ? `— ${result.author}` : '';
  show('prompt');
})();

document.getElementById('btnApprove').addEventListener('click', async () => {
  ['btnApprove','btnEdit','btnSkip'].forEach(id => document.getElementById(id).disabled = true);
  await motivation.approveQuote({ text: data.text, author: data.author });
});

document.getElementById('btnEdit').addEventListener('click', () => {
  document.getElementById('editText').value = data.text;
  document.getElementById('editAuthor').value = data.author || '';
  document.getElementById('editArea').classList.toggle('hidden');
});

document.getElementById('btnSave').addEventListener('click', () => {
  data.text = document.getElementById('editText').value.trim();
  data.author = document.getElementById('editAuthor').value.trim();
  document.getElementById('quoteText').textContent = `"${data.text}"`;
  document.getElementById('quoteAuthor').textContent = data.author ? `— ${data.author}` : '';
  document.getElementById('editArea').classList.add('hidden');
});

document.getElementById('btnSkip').addEventListener('click', () => motivation.skipQuote());
