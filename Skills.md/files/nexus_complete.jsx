import React, { useState } from 'react';
import { Search, Zap, Radar, Loader, Lightbulb, CheckCircle, Brain, Network, Upload, TrendingUp, Target, Bell, FileText, Link, X } from 'lucide-react';

const NexusComplete = () => {
  const [mode, setMode] = useState('discovery');
  const [topic, setTopic] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState('');

  // Synthesis State
  const [sources, setSources] = useState([]);
  const [sourceText, setSourceText] = useState('');

  // Radar State
  const [radarTopics, setRadarTopics] = useState([]);
  const [radarAlerts, setRadarAlerts] = useState([]);
  const [newRadarTopic, setNewRadarTopic] = useState('');

  // === DISCOVERY MODE ===
  const runDiscovery = async () => {
    setIsProcessing(true);
    setResults(null);

    try {
      setProgress('🔬 Phase 1/5: Deep Topic Analysis...');
      const r1 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{ role: "user", content: `Analyze "${topic}" deeply. Provide: 1) Core concepts (3-4 key ideas), 2) Current state (what exists now), 3) Main challenges (3 specific problems), 4) Key technologies. Be specific.` }]
        })
      });
      const d1 = await r1.json();
      const mainAnalysis = d1.content[0].text;

      setProgress('🌐 Phase 2/5: Cross-Pollinating Fields...');
      const r2 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{ role: "user", content: `List 8 completely unrelated fields to "${topic}" with unexpected connections. For each: Field Name: Specific technology or concept that could cross-pollinate. Be creative and surprising.` }]
        })
      });
      const d2 = await r2.json();
      const crossFields = d2.content[0].text;

      setProgress('📜 Phase 3/5: Historical Pattern Analysis...');
      const r3 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{ role: "user", content: `Analyze historical breakthroughs related to "${topic}". Identify 5 patterns of past innovations: what fields were combined, what was the catalyst, what made it work. Focus on cross-disciplinary examples.` }]
        })
      });
      const d3 = await r3.json();
      const historicalPatterns = d3.content[0].text;

      setProgress('💡 Phase 4/5: Generating Breakthroughs...');
      const r4 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2500,
          messages: [{ role: "user", content: `Given:\n\nTopic Analysis:\n${mainAnalysis}\n\nCross-Pollination Fields:\n${crossFields}\n\nHistorical Patterns:\n${historicalPatterns}\n\nGenerate 6 breakthrough ideas combining unrelated fields with "${topic}". For each:\n- Name (catchy)\n- Description (2-3 sentences)\n- Fields Combined\n- Novelty Score (1-10)\n- Feasibility Score (1-10)\n- First Step to Prototype\n\nThink like a visionary inventor.` }]
        })
      });
      const d4 = await r4.json();
      const breakthroughs = d4.content[0].text;

      setProgress('🛡️ Phase 5/5: Adversarial Validation...');
      const r5 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{ role: "user", content: `Red-team these breakthrough ideas:\n\n${breakthroughs}\n\nFor each idea: 1) Main weakness, 2) Biggest risk, 3) How to mitigate, 4) Refined version that's more feasible. Be critical but constructive.` }]
        })
      });
      const d5 = await r5.json();
      const validation = d5.content[0].text;

      setResults({ type: 'discovery', mainAnalysis, crossFields, historicalPatterns, breakthroughs, validation });
      setProgress('✅ 5-Phase Discovery Complete!');
    } catch (error) {
      setProgress('❌ Error: ' + error.message);
    }
    setIsProcessing(false);
  };

  // === SYNTHESIS MODE ===
  const runSynthesis = async () => {
    if (sources.length < 2) return;
    setIsProcessing(true);
    setResults(null);

    try {
      const sourcesText = sources.map((s, i) => `Source ${i + 1}:\n${s}`).join('\n\n---\n\n');

      setProgress('🔬 Phase 1/4: Analyzing Individual Sources...');
      const r1 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{ role: "user", content: `Analyze each source individually:\n\n${sourcesText}\n\nFor each source provide: Key themes, core arguments, unique insights, and methodology.` }]
        })
      });
      const d1 = await r1.json();
      const individualAnalysis = d1.content[0].text;

      setProgress('🔗 Phase 2/4: Finding Cross-Source Connections...');
      const r2 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{ role: "user", content: `Given these source analyses:\n\n${individualAnalysis}\n\nFind unexpected connections between these sources. Identify: 1) Hidden patterns across sources, 2) Contradictions that reveal insights, 3) Gaps that suggest new research areas, 4) Emergent themes no single source addresses.` }]
        })
      });
      const d2 = await r2.json();
      const connections = d2.content[0].text;

      setProgress('💡 Phase 3/4: Generating Synthesis Breakthroughs...');
      const r3 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{ role: "user", content: `Based on connections found:\n\n${connections}\n\nGenerate 5 synthesis breakthroughs - ideas that ONLY emerge from combining these specific sources. For each: Name, Description, Which sources it combines, Why it's novel, First action step.` }]
        })
      });
      const d3 = await r3.json();
      const synthesisBreakthroughs = d3.content[0].text;

      setProgress('🗺️ Phase 4/4: Building Knowledge Map...');
      const r4 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{ role: "user", content: `Create a knowledge map showing relationships between all concepts from:\n\nSources: ${sourcesText}\nConnections: ${connections}\nBreakthroughs: ${synthesisBreakthroughs}\n\nFormat as a structured text map showing: Nodes (key concepts), Edges (relationships), Clusters (related groups), and Bridges (cross-cluster connections).` }]
        })
      });
      const d4 = await r4.json();
      const knowledgeMap = d4.content[0].text;

      setResults({ type: 'synthesis', individualAnalysis, connections, synthesisBreakthroughs, knowledgeMap });
      setProgress('✅ Synthesis Complete!');
    } catch (error) {
      setProgress('❌ Error: ' + error.message);
    }
    setIsProcessing(false);
  };

  // === RADAR MODE ===
  const runRadarScan = async () => {
    if (radarTopics.length === 0) return;
    setIsProcessing(true);
    setRadarAlerts([]);

    try {
      for (let i = 0; i < radarTopics.length; i++) {
        setProgress(`📡 Scanning topic ${i + 1}/${radarTopics.length}: "${radarTopics[i]}"...`);
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            messages: [{ role: "user", content: `You are a breakthrough opportunity radar. Scan for opportunities in "${radarTopics[i]}". Generate 3 alerts:\n\nFor each alert provide:\n- Priority: HIGH, MEDIUM, or LOW\n- Topic: "${radarTopics[i]}"\n- Signal: What you detected\n- Opportunity: What to do about it\n- Confidence: 1-10\n- Time sensitivity: Act now / This week / This month\n\nFocus on emerging trends, weak signals, and adjacent opportunities.` }]
          })
        });
        const d = await r.json();
        setRadarAlerts(prev => [...prev, { topic: radarTopics[i], content: d.content[0].text, timestamp: new Date().toLocaleTimeString() }]);
      }
      setProgress('✅ Radar Scan Complete!');
    } catch (error) {
      setProgress('❌ Error: ' + error.message);
    }
    setIsProcessing(false);
  };

  const addSource = () => {
    if (sourceText.trim()) {
      setSources([...sources, sourceText.trim()]);
      setSourceText('');
    }
  };

  const addRadarTopic = () => {
    if (newRadarTopic.trim() && !radarTopics.includes(newRadarTopic.trim())) {
      setRadarTopics([...radarTopics, newRadarTopic.trim()]);
      setNewRadarTopic('');
    }
  };

  const sectionStyle = (color) => ({
    background: color,
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '15px'
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center', padding: '40px 0 20px' }}>
        <h1 style={{ color: 'white', fontSize: '48px', margin: 0, fontWeight: '800' }}>⚡ NEXUS</h1>
        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '20px', margin: '10px 0 0' }}>The Breakthrough Discovery Engine</p>
      </div>

      {/* Mode Tabs */}
      <div style={{ maxWidth: '800px', margin: '20px auto', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
        {[
          { id: 'discovery', label: 'Discovery', icon: <Search size={18} /> },
          { id: 'synthesis', label: 'Synthesis', icon: <Network size={18} /> },
          { id: 'radar', label: 'Radar', icon: <Radar size={18} /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setMode(tab.id); setResults(null); setProgress(''); }}
            style={{
              padding: '12px 24px',
              background: mode === tab.id ? 'white' : 'rgba(255,255,255,0.2)',
              color: mode === tab.id ? '#764ba2' : 'white',
              border: 'none',
              borderRadius: '25px',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '15px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: '800px', margin: '20px auto' }}>
        <div style={{ background: 'white', borderRadius: '20px', padding: '30px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

          {/* ========== DISCOVERY MODE ========== */}
          {mode === 'discovery' && (
            <>
              <h2 style={{ margin: '0 0 10px', color: '#333' }}>🔬 Discovery Mode</h2>
              <p style={{ color: '#666', marginBottom: '20px' }}>5-phase cross-pollination engine for breakthrough ideas.</p>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Enter a topic (e.g., solar panels, cancer research)"
                  style={{ flex: 1, padding: '15px 20px', border: '2px solid #e0e0e0', borderRadius: '12px', fontSize: '16px', outline: 'none' }}
                  onKeyDown={(e) => e.key === 'Enter' && topic && !isProcessing && runDiscovery()}
                />
                <button
                  onClick={runDiscovery}
                  disabled={!topic || isProcessing}
                  style={{
                    padding: '15px 30px',
                    background: isProcessing ? '#ccc' : 'linear-gradient(135deg, #667eea, #764ba2)',
                    color: 'white', border: 'none', borderRadius: '12px',
                    cursor: isProcessing ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '15px'
                  }}
                >
                  {isProcessing ? '⏳ Running...' : '⚡ Run Discovery'}
                </button>
              </div>

              {results?.type === 'discovery' && (
                <>
                  <div style={sectionStyle('#f0f4ff')}>
                    <h3 style={{ color: '#667eea', margin: '0 0 10px' }}>🧠 Deep Analysis</h3>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#333' }}>{results.mainAnalysis}</div>
                  </div>
                  <div style={sectionStyle('#f0fff4')}>
                    <h3 style={{ color: '#38a169', margin: '0 0 10px' }}>🌐 Cross-Pollination Fields</h3>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#333' }}>{results.crossFields}</div>
                  </div>
                  <div style={sectionStyle('#fff5f0')}>
                    <h3 style={{ color: '#e53e3e', margin: '0 0 10px' }}>📜 Historical Patterns</h3>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#333' }}>{results.historicalPatterns}</div>
                  </div>
                  <div style={sectionStyle('#fffbf0')}>
                    <h3 style={{ color: '#d69e2e', margin: '0 0 10px' }}>💡 Breakthrough Ideas</h3>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#333' }}>{results.breakthroughs}</div>
                  </div>
                  <div style={sectionStyle('#f5f0ff')}>
                    <h3 style={{ color: '#805ad5', margin: '0 0 10px' }}>🛡️ Adversarial Validation</h3>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#333' }}>{results.validation}</div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ========== SYNTHESIS MODE ========== */}
          {mode === 'synthesis' && (
            <>
              <h2 style={{ margin: '0 0 10px', color: '#333' }}>🔗 Synthesis Mode</h2>
              <p style={{ color: '#666', marginBottom: '20px' }}>Upload 2+ sources to discover hidden connections between them.</p>

              <div style={{ marginBottom: '20px' }}>
                <textarea
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  placeholder="Paste a source text (article, paper, notes)..."
                  rows={4}
                  style={{ width: '100%', padding: '15px', border: '2px solid #e0e0e0', borderRadius: '12px', fontSize: '14px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
                <button onClick={addSource} disabled={!sourceText.trim()} style={{
                  marginTop: '10px', padding: '10px 20px', background: sourceText.trim() ? '#667eea' : '#ccc',
                  color: 'white', border: 'none', borderRadius: '8px', cursor: sourceText.trim() ? 'pointer' : 'not-allowed', fontWeight: '600'
                }}>
                  + Add Source ({sources.length} added)
                </button>
              </div>

              {sources.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  {sources.map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', background: '#f8f9ff', borderRadius: '8px', marginBottom: '8px' }}>
                      <span style={{ color: '#333' }}>📄 Source {i + 1}: {s.substring(0, 80)}...</span>
                      <button onClick={() => setSources(sources.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e' }}>
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={runSynthesis}
                disabled={sources.length < 2 || isProcessing}
                style={{
                  width: '100%', padding: '15px', background: (sources.length < 2 || isProcessing) ? '#ccc' : 'linear-gradient(135deg, #667eea, #764ba2)',
                  color: 'white', border: 'none', borderRadius: '12px', cursor: (sources.length < 2 || isProcessing) ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '16px'
                }}
              >
                {isProcessing ? '⏳ Synthesizing...' : `🔗 Synthesize ${sources.length} Sources`}
              </button>

              {results?.type === 'synthesis' && (
                <>
                  <div style={{ ...sectionStyle('#f0f4ff'), marginTop: '20px' }}>
                    <h3 style={{ color: '#667eea', margin: '0 0 10px' }}>📊 Individual Analysis</h3>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#333' }}>{results.individualAnalysis}</div>
                  </div>
                  <div style={sectionStyle('#f0fff4')}>
                    <h3 style={{ color: '#38a169', margin: '0 0 10px' }}>🔗 Cross-Source Connections</h3>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#333' }}>{results.connections}</div>
                  </div>
                  <div style={sectionStyle('#fffbf0')}>
                    <h3 style={{ color: '#d69e2e', margin: '0 0 10px' }}>💡 Synthesis Breakthroughs</h3>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#333' }}>{results.synthesisBreakthroughs}</div>
                  </div>
                  <div style={sectionStyle('#f5f0ff')}>
                    <h3 style={{ color: '#805ad5', margin: '0 0 10px' }}>🗺️ Knowledge Map</h3>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#333' }}>{results.knowledgeMap}</div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ========== RADAR MODE ========== */}
          {mode === 'radar' && (
            <>
              <h2 style={{ margin: '0 0 10px', color: '#333' }}>📡 Radar Mode</h2>
              <p style={{ color: '#666', marginBottom: '20px' }}>Monitor topics for breakthrough opportunities.</p>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input
                  type="text"
                  value={newRadarTopic}
                  onChange={(e) => setNewRadarTopic(e.target.value)}
                  placeholder="Add a topic to monitor..."
                  style={{ flex: 1, padding: '12px 15px', border: '2px solid #e0e0e0', borderRadius: '10px', fontSize: '15px', outline: 'none' }}
                  onKeyDown={(e) => e.key === 'Enter' && addRadarTopic()}
                />
                <button onClick={addRadarTopic} disabled={!newRadarTopic.trim()} style={{
                  padding: '12px 20px', background: newRadarTopic.trim() ? '#667eea' : '#ccc',
                  color: 'white', border: 'none', borderRadius: '10px', cursor: newRadarTopic.trim() ? 'pointer' : 'not-allowed', fontWeight: '600'
                }}>
                  + Add Topic
                </button>
              </div>

              {radarTopics.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                  {radarTopics.map((t, i) => (
                    <span key={i} style={{
                      padding: '8px 14px', background: '#f0f4ff', borderRadius: '20px', color: '#667eea',
                      fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px'
                    }}>
                      📡 {t}
                      <button onClick={() => setRadarTopics(radarTopics.filter((_, idx) => idx !== i))} style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', padding: 0
                      }}>
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <button
                onClick={runRadarScan}
                disabled={radarTopics.length === 0 || isProcessing}
                style={{
                  width: '100%', padding: '15px',
                  background: (radarTopics.length === 0 || isProcessing) ? '#ccc' : 'linear-gradient(135deg, #667eea, #764ba2)',
                  color: 'white', border: 'none', borderRadius: '12px',
                  cursor: (radarTopics.length === 0 || isProcessing) ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '16px'
                }}
              >
                {isProcessing ? '⏳ Scanning...' : `📡 Run Radar Scan (${radarTopics.length} topics)`}
              </button>

              {radarAlerts.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  {radarAlerts.map((alert, i) => (
                    <div key={i} style={{
                      border: '2px solid #667eea', borderRadius: '12px', padding: '20px', marginBottom: '15px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontWeight: '700', color: '#667eea', fontSize: '16px' }}>📡 {alert.topic}</span>
                        <span style={{ color: '#999', fontSize: '13px' }}>{alert.timestamp}</span>
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#333' }}>{alert.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Progress Bar */}
          {progress && (
            <div style={{ padding: '15px', background: '#f8f9ff', borderRadius: '10px', color: '#667eea', fontWeight: '600', marginTop: '20px' }}>
              {progress}
            </div>
          )}

          {/* Copy Report Button */}
          {results && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => {
                  const report = JSON.stringify(results, null, 2);
                  navigator.clipboard.writeText(report);
                  alert('Full report copied to clipboard!');
                }}
                style={{
                  flex: 1, padding: '14px', background: 'white', border: '2px solid #667eea',
                  borderRadius: '10px', color: '#667eea', fontWeight: '600', cursor: 'pointer', fontSize: '15px'
                }}
              >
                📋 Copy Full Report
              </button>
              <button
                onClick={() => { setResults(null); setProgress(''); }}
                style={{
                  flex: 1, padding: '14px', background: 'white', border: '2px solid #764ba2',
                  borderRadius: '10px', color: '#764ba2', fontWeight: '600', cursor: 'pointer', fontSize: '15px'
                }}
              >
                ⚡ New Session
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ maxWidth: '1200px', margin: '20px auto 0', textAlign: 'center', color: 'white', fontSize: '14px', opacity: 0.8 }}>
        <div>NEXUS • The Breakthrough Discovery Engine • All 3 Modes</div>
      </div>
    </div>
  );
};

export default NexusComplete;
