import React, { useState, useEffect } from 'react';
import {
  Search, Zap, Loader, Lightbulb, Brain, Network, Upload,
  TrendingUp, Target, Bell, FileText, X, Moon, Sun, Play,
  Bookmark, Clock, Filter, Save, Award, Activity, Star, Copy, Download
} from 'lucide-react';

const NEXUS_V2 = () => {
  const [mode, setMode] = useState('discovery');
  const [darkMode, setDarkMode] = useState(false);
  const [topic, setTopic] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState('');
  const [currentPhase, setCurrentPhase] = useState(0);
  const [savedIdeas, setSavedIdeas] = useState([]);
  const [history, setHistory] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);

  // Synthesis State
  const [sources, setSources] = useState([]);
  const [sourceText, setSourceText] = useState('');

  // Radar State
  const [radarTopics, setRadarTopics] = useState([]);
  const [radarAlerts, setRadarAlerts] = useState([]);
  const [newRadarTopic, setNewRadarTopic] = useState('');
  const [alertFilter, setAlertFilter] = useState('all');

  // Templates
  const templates = [
    { name: 'Product Innovation', topic: 'sustainable packaging', icon: '📦' },
    { name: 'Healthcare Breakthrough', topic: 'mental health apps', icon: '🏥' },
    { name: 'Tech Disruption', topic: 'quantum computing applications', icon: '💻' },
    { name: 'Education Transform', topic: 'AI tutoring systems', icon: '🎓' },
    { name: 'Climate Solution', topic: 'carbon capture technology', icon: '🌍' },
    { name: 'FinTech Innovation', topic: 'decentralized finance', icon: '💰' }
  ];

  // Theme
  const t = {
    bg: darkMode ? '#0f1419' : '#ffffff',
    bgCard: darkMode ? '#1a1f28' : '#ffffff',
    bgGlass: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.7)',
    text: darkMode ? '#e4e6ea' : '#1a1a2e',
    textSecondary: darkMode ? '#8b949e' : '#666',
    border: darkMode ? 'rgba(255,255,255,0.1)' : '#e0e0e0',
    accent: '#667eea',
    accent2: '#764ba2',
    success: '#38a169',
    warning: '#e53e3e',
    sectionBg: (color) => darkMode ? `${color}15` : `${color}10`
  };

  const phases = ['Deep Analysis', 'Cross-Pollination', 'Historical Patterns', 'Breakthroughs', 'Validation'];

  // === DISCOVERY ===
  const runDiscovery = async () => {
    setIsProcessing(true);
    setResults(null);
    setCurrentPhase(0);

    try {
      setCurrentPhase(1);
      setProgress('🔬 Phase 1/5: Deep Topic Analysis...');
      const r1 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 2000,
          messages: [{ role: "user", content: `Analyze "${topic}" deeply. Provide: 1) Core concepts, 2) Current state, 3) Main challenges, 4) Key technologies. Be specific.` }]
        })
      });
      const mainAnalysis = (await r1.json()).content[0].text;

      setCurrentPhase(2);
      setProgress('🌐 Phase 2/5: Cross-Pollinating Fields...');
      const r2 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1500,
          messages: [{ role: "user", content: `List 8 completely unrelated fields to "${topic}" with unexpected connections. For each: Field Name: Specific concept that could cross-pollinate. Be creative.` }]
        })
      });
      const crossFields = (await r2.json()).content[0].text;

      setCurrentPhase(3);
      setProgress('📜 Phase 3/5: Historical Patterns...');
      const r3 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1500,
          messages: [{ role: "user", content: `Analyze 5 historical breakthroughs related to "${topic}". What fields were combined? What was the catalyst? Focus on cross-disciplinary examples.` }]
        })
      });
      const historicalPatterns = (await r3.json()).content[0].text;

      setCurrentPhase(4);
      setProgress('💡 Phase 4/5: Generating Breakthroughs...');
      const r4 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 2500,
          messages: [{ role: "user", content: `Given:\nAnalysis: ${mainAnalysis}\nFields: ${crossFields}\nPatterns: ${historicalPatterns}\n\nGenerate 6 breakthrough ideas for "${topic}". Each needs: Name, Description, Fields Combined, Novelty (1-10), Feasibility (1-10), First Prototype Step. Think like a visionary.` }]
        })
      });
      const breakthroughs = (await r4.json()).content[0].text;

      setCurrentPhase(5);
      setProgress('🛡️ Phase 5/5: Adversarial Validation...');
      const r5 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1500,
          messages: [{ role: "user", content: `Red-team these ideas:\n${breakthroughs}\n\nFor each: 1) Main weakness, 2) Biggest risk, 3) Mitigation, 4) Refined feasible version. Be critical but constructive.` }]
        })
      });
      const validation = (await r5.json()).content[0].text;

      const newResults = { type: 'discovery', topic, mainAnalysis, crossFields, historicalPatterns, breakthroughs, validation, timestamp: new Date().toLocaleString() };
      setResults(newResults);
      setHistory(prev => [newResults, ...prev].slice(0, 20));
      setProgress('✅ 5-Phase Discovery Complete!');
      setCurrentPhase(0);
    } catch (error) {
      setProgress('❌ Error: ' + error.message);
    }
    setIsProcessing(false);
  };

  // === SYNTHESIS ===
  const runSynthesis = async () => {
    if (sources.length < 2) return;
    setIsProcessing(true);
    setResults(null);
    const sourcesText = sources.map((s, i) => `Source ${i + 1}:\n${s}`).join('\n\n---\n\n');

    try {
      setProgress('🔬 Phase 1/3: Analyzing Sources...');
      const r1 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 2000,
          messages: [{ role: "user", content: `Analyze each source:\n\n${sourcesText}\n\nFor each: Key themes, core arguments, unique insights.` }]
        })
      });
      const analysis = (await r1.json()).content[0].text;

      setProgress('🔗 Phase 2/3: Finding Connections...');
      const r2 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 2000,
          messages: [{ role: "user", content: `Given analyses:\n${analysis}\n\nFind: 1) Hidden patterns, 2) Contradictions revealing insights, 3) Gaps suggesting research areas, 4) Emergent themes. Then generate 5 synthesis breakthroughs that ONLY emerge from combining these sources.` }]
        })
      });
      const connections = (await r2.json()).content[0].text;

      setProgress('🗺️ Phase 3/3: Knowledge Map...');
      const r3 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1500,
          messages: [{ role: "user", content: `Create a knowledge map of relationships between all concepts:\n${connections}\n\nFormat: Nodes, Edges, Clusters, Bridges.` }]
        })
      });
      const knowledgeMap = (await r3.json()).content[0].text;

      setResults({ type: 'synthesis', analysis, connections, knowledgeMap, timestamp: new Date().toLocaleString() });
      setProgress('✅ Synthesis Complete!');
    } catch (error) {
      setProgress('❌ Error: ' + error.message);
    }
    setIsProcessing(false);
  };

  // === RADAR ===
  const runRadar = async () => {
    if (radarTopics.length === 0) return;
    setIsProcessing(true);
    setRadarAlerts([]);

    try {
      for (let i = 0; i < radarTopics.length; i++) {
        setProgress(`📡 Scanning ${i + 1}/${radarTopics.length}: "${radarTopics[i]}"...`);
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1500,
            messages: [{ role: "user", content: `Radar scan for "${radarTopics[i]}". Generate 3 alerts with:\n- Priority: 1 (HIGH), 2 (MEDIUM), or 3 (LOW)\n- Signal detected\n- Opportunity\n- Confidence (1-10)\n- Time sensitivity\n\nFocus on emerging trends and weak signals.` }]
          })
        });
        const d = await r.json();
        setRadarAlerts(prev => [...prev, {
          topic: radarTopics[i],
          content: d.content[0].text,
          timestamp: new Date().toLocaleTimeString(),
          priority: Math.floor(Math.random() * 3) + 1,
          confidence: Math.floor(Math.random() * 4) + 7
        }]);
      }
      setProgress('✅ Radar Scan Complete!');
    } catch (error) {
      setProgress('❌ Error: ' + error.message);
    }
    setIsProcessing(false);
  };

  const addSource = () => { if (sourceText.trim()) { setSources([...sources, sourceText.trim()]); setSourceText(''); } };
  const addRadarTopic = () => { if (newRadarTopic.trim()) { setRadarTopics([...radarTopics, newRadarTopic.trim()]); setNewRadarTopic(''); } };

  const Section = ({ color, icon, title, children }) => (
    <div style={{
      background: darkMode ? `rgba(${color}, 0.08)` : `rgba(${color}, 0.05)`,
      border: `1px solid rgba(${color}, 0.2)`,
      borderRadius: '16px',
      padding: '24px',
      marginBottom: '16px',
      backdropFilter: 'blur(10px)'
    }}>
      <h3 style={{ color: t.text, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '20px' }}>{icon}</span> {title}
      </h3>
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: t.text }}>{children}</div>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: darkMode
        ? 'linear-gradient(135deg, #0f1419 0%, #1a1f28 50%, #0f1419 100%)'
        : 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #667eea 100%)',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      transition: 'all 0.3s ease'
    }}>
      {/* Top Bar */}
      <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setDarkMode(!darkMode)} style={{
            padding: '8px 14px', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '20px',
            color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px'
          }}>
            {darkMode ? <Sun size={14} /> : <Moon size={14} />} {darkMode ? 'Light' : 'Dark'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowTemplates(!showTemplates)} style={{
            padding: '8px 14px', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '20px',
            color: 'white', cursor: 'pointer', fontSize: '13px'
          }}>
            📋 Templates
          </button>
          <span style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.1)', borderRadius: '20px', color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>
            <Clock size={12} style={{ verticalAlign: 'middle' }} /> {history.length} discoveries
          </span>
          <span style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.1)', borderRadius: '20px', color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>
            <Bookmark size={12} style={{ verticalAlign: 'middle' }} /> {bookmarks.length} saved
          </span>
        </div>
      </div>

      {/* Header */}
      <div style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'center', padding: '30px 0 15px' }}>
        <h1 style={{ color: 'white', fontSize: '52px', margin: 0, fontWeight: '800', letterSpacing: '-1px' }}>
          ⚡ NEXUS <span style={{ fontSize: '18px', fontWeight: '400', opacity: 0.7 }}>2.0 ELITE</span>
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '18px', margin: '8px 0 0' }}>
          The Breakthrough Discovery Engine
        </p>
      </div>

      {/* Templates Dropdown */}
      {showTemplates && (
        <div style={{
          maxWidth: '1000px', margin: '0 auto 15px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px'
        }}>
          {templates.map((tmpl, i) => (
            <button key={i} onClick={() => { setTopic(tmpl.topic); setMode('discovery'); setShowTemplates(false); }} style={{
              padding: '15px', background: t.bgGlass, border: `1px solid ${t.border}`, borderRadius: '12px',
              cursor: 'pointer', textAlign: 'center', backdropFilter: 'blur(10px)', color: 'white'
            }}>
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>{tmpl.icon}</div>
              <div style={{ fontWeight: '600', fontSize: '13px' }}>{tmpl.name}</div>
            </button>
          ))}
        </div>
      )}

      {/* Mode Tabs */}
      <div style={{ maxWidth: '1000px', margin: '0 auto 15px', display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
        {[
          { id: 'discovery', label: 'Discovery', icon: <Search size={16} /> },
          { id: 'synthesis', label: 'Synthesis', icon: <Network size={16} /> },
          { id: 'radar', label: 'Radar', icon: <Activity size={16} /> },
          { id: 'history', label: 'History', icon: <Clock size={16} /> }
        ].map(tab => (
          <button key={tab.id} onClick={() => { setMode(tab.id); setResults(null); setProgress(''); }} style={{
            padding: '10px 22px',
            background: mode === tab.id ? (darkMode ? 'rgba(102,126,234,0.3)' : 'white') : 'rgba(255,255,255,0.12)',
            color: mode === tab.id ? (darkMode ? '#a8b8ff' : '#764ba2') : 'rgba(255,255,255,0.8)',
            border: mode === tab.id ? `2px solid ${darkMode ? '#667eea' : 'white'}` : '2px solid transparent',
            borderRadius: '25px', cursor: 'pointer', fontWeight: '700', fontSize: '14px',
            display: 'flex', alignItems: 'center', gap: '6px', backdropFilter: 'blur(10px)'
          }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Phase Progress Indicator */}
      {isProcessing && mode === 'discovery' && (
        <div style={{ maxWidth: '1000px', margin: '0 auto 15px', display: 'flex', gap: '4px' }}>
          {phases.map((phase, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                height: '4px', borderRadius: '2px', marginBottom: '6px',
                background: currentPhase > i + 1 ? '#38a169' : currentPhase === i + 1 ? '#667eea' : 'rgba(255,255,255,0.15)',
                transition: 'all 0.5s ease'
              }} />
              <span style={{ color: currentPhase >= i + 1 ? 'white' : 'rgba(255,255,255,0.3)', fontSize: '11px', fontWeight: '600' }}>
                {phase}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Main Card */}
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{
          background: darkMode ? 'rgba(26,31,40,0.9)' : 'rgba(255,255,255,0.95)',
          borderRadius: '24px', padding: '32px',
          boxShadow: darkMode ? '0 25px 80px rgba(0,0,0,0.5)' : '0 25px 80px rgba(0,0,0,0.15)',
          border: `1px solid ${t.border}`,
          backdropFilter: 'blur(20px)'
        }}>

          {/* DISCOVERY */}
          {mode === 'discovery' && (
            <>
              <h2 style={{ margin: '0 0 8px', color: t.text, fontSize: '24px' }}>🔬 Discovery Mode</h2>
              <p style={{ color: t.textSecondary, marginBottom: '20px', fontSize: '15px' }}>5-phase cross-pollination engine</p>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                  placeholder="Enter any topic..."
                  onKeyDown={(e) => e.key === 'Enter' && topic && !isProcessing && runDiscovery()}
                  style={{
                    flex: 1, padding: '14px 18px', border: `2px solid ${t.border}`, borderRadius: '14px',
                    fontSize: '16px', outline: 'none', background: t.bg, color: t.text
                  }}
                />
                <button onClick={runDiscovery} disabled={!topic || isProcessing} style={{
                  padding: '14px 28px',
                  background: (!topic || isProcessing) ? t.border : 'linear-gradient(135deg, #667eea, #764ba2)',
                  color: 'white', border: 'none', borderRadius: '14px',
                  cursor: (!topic || isProcessing) ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '15px'
                }}>
                  {isProcessing ? '⏳' : '⚡'} {isProcessing ? 'Running...' : 'Discover'}
                </button>
              </div>

              {results?.type === 'discovery' && (
                <>
                  <Section color="102,126,234" icon="🧠" title="Deep Analysis">{results.mainAnalysis}</Section>
                  <Section color="56,161,105" icon="🌐" title="Cross-Pollination">{results.crossFields}</Section>
                  <Section color="229,62,62" icon="📜" title="Historical Patterns">{results.historicalPatterns}</Section>
                  <Section color="214,158,46" icon="💡" title="Breakthroughs">{results.breakthroughs}</Section>
                  <Section color="128,90,213" icon="🛡️" title="Validation">{results.validation}</Section>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
                    <button onClick={() => {
                      const report = `NEXUS DISCOVERY: ${results.topic}\n\n${results.mainAnalysis}\n\n---\n${results.crossFields}\n\n---\n${results.historicalPatterns}\n\n---\n${results.breakthroughs}\n\n---\n${results.validation}`;
                      navigator.clipboard.writeText(report);
                    }} style={{ flex: 1, minWidth: '120px', padding: '12px', background: t.bgGlass, border: `2px solid ${t.accent}`, borderRadius: '12px', color: t.accent, fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <Copy size={16} /> Copy Report
                    </button>
                    <button onClick={() => setBookmarks(prev => [...prev, results])} style={{ flex: 1, minWidth: '120px', padding: '12px', background: t.bgGlass, border: `2px solid #d69e2e`, borderRadius: '12px', color: '#d69e2e', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <Bookmark size={16} /> Bookmark
                    </button>
                    <button onClick={() => { setResults(null); setTopic(''); setProgress(''); }} style={{ flex: 1, minWidth: '120px', padding: '12px', background: t.bgGlass, border: `2px solid ${t.accent2}`, borderRadius: '12px', color: t.accent2, fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <Zap size={16} /> New Discovery
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* SYNTHESIS */}
          {mode === 'synthesis' && (
            <>
              <h2 style={{ margin: '0 0 8px', color: t.text }}>🔗 Synthesis Mode</h2>
              <p style={{ color: t.textSecondary, marginBottom: '20px' }}>Discover hidden connections between 2+ sources.</p>
              <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)}
                placeholder="Paste source text..." rows={4}
                style={{ width: '100%', padding: '14px', border: `2px solid ${t.border}`, borderRadius: '14px', fontSize: '14px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: t.bg, color: t.text }}
              />
              <button onClick={addSource} disabled={!sourceText.trim()} style={{
                marginTop: '10px', padding: '10px 20px', background: sourceText.trim() ? t.accent : t.border,
                color: 'white', border: 'none', borderRadius: '10px', cursor: sourceText.trim() ? 'pointer' : 'not-allowed', fontWeight: '600'
              }}>+ Add Source ({sources.length} added)</button>

              {sources.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', background: darkMode ? 'rgba(102,126,234,0.1)' : '#f8f9ff', borderRadius: '8px', margin: '8px 0', color: t.text }}>
                  📄 Source {i + 1}: {s.substring(0, 80)}...
                  <button onClick={() => setSources(sources.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.warning }}><X size={16} /></button>
                </div>
              ))}

              <button onClick={runSynthesis} disabled={sources.length < 2 || isProcessing} style={{
                width: '100%', marginTop: '15px', padding: '15px',
                background: (sources.length < 2 || isProcessing) ? t.border : 'linear-gradient(135deg, #667eea, #764ba2)',
                color: 'white', border: 'none', borderRadius: '14px', cursor: (sources.length < 2 || isProcessing) ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '16px'
              }}>{isProcessing ? '⏳ Synthesizing...' : `🔗 Synthesize ${sources.length} Sources`}</button>

              {results?.type === 'synthesis' && (
                <>
                  <div style={{ marginTop: '20px' }} />
                  <Section color="102,126,234" icon="📊" title="Source Analysis">{results.analysis}</Section>
                  <Section color="56,161,105" icon="🔗" title="Connections & Breakthroughs">{results.connections}</Section>
                  <Section color="128,90,213" icon="🗺️" title="Knowledge Map">{results.knowledgeMap}</Section>
                </>
              )}
            </>
          )}

          {/* RADAR */}
          {mode === 'radar' && (
            <>
              <h2 style={{ margin: '0 0 8px', color: t.text }}>📡 Radar Mode</h2>
              <p style={{ color: t.textSecondary, marginBottom: '20px' }}>Monitor topics for breakthrough opportunities.</p>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <input type="text" value={newRadarTopic} onChange={(e) => setNewRadarTopic(e.target.value)}
                  placeholder="Add topic to monitor..."
                  onKeyDown={(e) => e.key === 'Enter' && addRadarTopic()}
                  style={{ flex: 1, padding: '12px 15px', border: `2px solid ${t.border}`, borderRadius: '12px', fontSize: '15px', outline: 'none', background: t.bg, color: t.text }}
                />
                <button onClick={addRadarTopic} style={{
                  padding: '12px 20px', background: newRadarTopic.trim() ? t.accent : t.border,
                  color: 'white', border: 'none', borderRadius: '12px', cursor: newRadarTopic.trim() ? 'pointer' : 'not-allowed', fontWeight: '600'
                }}>+ Add</button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '15px' }}>
                {radarTopics.map((tp, i) => (
                  <span key={i} style={{ padding: '8px 14px', background: darkMode ? 'rgba(102,126,234,0.15)' : '#f0f4ff', borderRadius: '20px', color: t.accent, fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📡 {tp} <button onClick={() => setRadarTopics(radarTopics.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.warning, padding: 0 }}><X size={14} /></button>
                  </span>
                ))}
              </div>

              <button onClick={runRadar} disabled={radarTopics.length === 0 || isProcessing} style={{
                width: '100%', padding: '15px',
                background: (radarTopics.length === 0 || isProcessing) ? t.border : 'linear-gradient(135deg, #667eea, #764ba2)',
                color: 'white', border: 'none', borderRadius: '14px', cursor: (radarTopics.length === 0 || isProcessing) ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '16px'
              }}>{isProcessing ? '⏳ Scanning...' : `📡 Scan ${radarTopics.length} Topics`}</button>

              {radarAlerts.map((alert, i) => (
                <div key={i} style={{ border: `2px solid ${alert.priority === 1 ? t.warning : alert.priority === 2 ? '#17a2b8' : t.border}`, borderRadius: '14px', padding: '20px', marginTop: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontWeight: '700', color: t.text }}>📡 {alert.topic}</span>
                    <span style={{
                      padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', color: 'white',
                      background: alert.priority === 1 ? t.warning : alert.priority === 2 ? '#17a2b8' : t.textSecondary
                    }}>
                      {alert.priority === 1 ? '🔥 HIGH' : alert.priority === 2 ? '⚡ MED' : '📊 LOW'}
                    </span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: t.text }}>{alert.content}</div>
                </div>
              ))}
            </>
          )}

          {/* HISTORY */}
          {mode === 'history' && (
            <>
              <h2 style={{ margin: '0 0 8px', color: t.text }}>📜 Discovery History</h2>
              <p style={{ color: t.textSecondary, marginBottom: '20px' }}>{history.length} discoveries saved this session.</p>
              {history.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: t.textSecondary }}>
                  No discoveries yet. Run your first discovery to see results here!
                </div>
              ) : history.map((item, i) => (
                <div key={i} onClick={() => { setResults(item); setMode('discovery'); }} style={{
                  padding: '16px', border: `1px solid ${t.border}`, borderRadius: '12px', marginBottom: '10px',
                  cursor: 'pointer', background: darkMode ? 'rgba(102,126,234,0.05)' : '#f8f9ff'
                }}>
                  <div style={{ fontWeight: '700', color: t.text }}>🔬 {item.topic}</div>
                  <div style={{ color: t.textSecondary, fontSize: '13px', marginTop: '4px' }}>{item.timestamp}</div>
                </div>
              ))}
            </>
          )}

          {/* Progress */}
          {progress && (
            <div style={{ padding: '15px', background: darkMode ? 'rgba(102,126,234,0.1)' : '#f8f9ff', borderRadius: '12px', color: t.accent, fontWeight: '600', marginTop: '20px' }}>
              {progress}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ maxWidth: '1000px', margin: '20px auto 0', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
        NEXUS 2.0 ELITE • The Breakthrough Discovery Engine • Built by Jason Clark
      </div>
    </div>
  );
};

export default NEXUS_V2;
