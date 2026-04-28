const { motivation } = window;

const views = { loading: 'loadingView', prompt: 'promptView', error: 'errorView' };
let data = null;

function show(name) {
  Object.values(views).forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById(views[name]).classList.remove('hidden');
}

// Boot
(async () => {
  const result = await motivation.researchTopic();
  if (result.error) {
    document.getElementById('errorMsg').textContent = result.error;
    show('error'); return;
  }
  data = result;
  document.getElementById('topicBadge').textContent = result.topic;
  document.getElementById('scriptText').textContent = result.script;

  // Pexels thumbnail strip
  const strip = document.getElementById('previewStrip');
  (result.thumbs || []).slice(0, 6).forEach(url => {
    const div = document.createElement('div');
    div.className = 'preview-thumb';
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    div.appendChild(img);
    strip.appendChild(div);
  });

  show('prompt');
})();

// Approve
document.getElementById('btnApprove').addEventListener('click', async () => {
  ['btnApprove','btnEdit','btnSkip'].forEach(id => document.getElementById(id).disabled = true);
  await motivation.approvePost({ script: data.script, videoIds: data.videoIds, topic: data.topic, caption: data.caption, title: data.title });
});

// Edit
document.getElementById('btnEdit').addEventListener('click', () => {
  document.getElementById('editScript').value = data.script;
  document.getElementById('editArea').classList.toggle('hidden');
});

document.getElementById('btnSave').addEventListener('click', () => {
  data.script = document.getElementById('editScript').value.trim();
  document.getElementById('scriptText').textContent = data.script;
  document.getElementById('editArea').classList.add('hidden');
});

// Skip
document.getElementById('btnSkip').addEventListener('click', () => motivation.skipToday());
