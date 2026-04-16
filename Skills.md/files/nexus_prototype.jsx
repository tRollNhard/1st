import React, { useState } from 'react';
import { Search, Zap, Radar, Loader, Lightbulb, CheckCircle, Brain, Network } from 'lucide-react';

const NexusApp = () => {
  const [mode, setMode] = useState('discovery');
  const [topic, setTopic] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState('');

  const runDiscovery = async () => {
    setIsDiscovering(true);
    setResults(null);
    setProgress('Initializing NEXUS Discovery Engine...');

    try {
      // Phase 1: Deep topic analysis
      setProgress('🔍 Phase 1: Deep topic analysis...');
      const mainResearch = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `Analyze this topic deeply: "${topic}". Provide: 1) Core concepts, 2) Current state, 3) Main challenges, 4) Key technologies involved. Be specific and technical.`
          }]
        })
      });
      const mainData = await mainResearch.json();
      const mainAnalysis = mainData.content[0].text;

      // Phase 2: Cross-pollination
      setProgress('🌐 Phase 2: Cross-pollinating with unrelated fields...');
      const fieldsResearch = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{
            role: "user",
            content: `List 8 completely unrelated fields to "${topic}" that might have unexpected connections. For each field, give one specific technology or concept. Format as: Field: Concept. Be creative and surprising.`
          }]
        })
      });
      const fieldsData = await fieldsResearch.json();
      const crossFields = fieldsData.content[0].text;

      // Phase 3: Breakthrough synthesis
      setProgress('💡 Phase 3: Generating breakthrough ideas...');
      const breakthroughResearch = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `Given this analysis of "${topic}":\n\n${mainAnalysis}\n\nAnd these cross-pollination fields:\n\n${crossFields}\n\nGenerate 6 breakthrough ideas that combine concepts from unrelated fields with "${topic}". For each idea provide:\n- Name\n- Description (2-3 sentences)\n- Which fields it combines\n- Novelty score (1-10)\n- Feasibility score (1-10)\n\nThink like a visionary inventor.`
          }]
        })
      });
      const breakthroughData = await breakthroughResearch.json();
      const breakthroughs = breakthroughData.content[0].text;

      setResults({
        mainAnalysis,
        crossFields,
        breakthroughs
      });
      setProgress('✅ Discovery complete!');
    } catch (error) {
      setProgress('❌ Error: ' + error.message);
    }
    setIsDiscovering(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        textAlign: 'center',
        padding: '40px 0 20px'
      }}>
        <h1 style={{ color: 'white', fontSize: '48px', margin: 0, fontWeight: '800' }}>
          ⚡ NEXUS
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '20px', margin: '10px 0 0' }}>
          The Breakthrough Discovery Engine
        </p>
      </div>

      {/* Mode Tabs */}
      <div style={{
        maxWidth: '800px',
        margin: '20px auto',
        display: 'flex',
        gap: '10px',
        justifyContent: 'center'
      }}>
        {[
          { id: 'discovery', label: 'Discovery', icon: <Search size={18} /> },
          { id: 'synthesis', label: 'Synthesis', icon: <Network size={18} /> },
          { id: 'radar', label: 'Radar', icon: <Radar size={18} /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id)}
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
              gap: '8px',
              transition: 'all 0.3s ease'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Discovery Mode */}
      {mode === 'discovery' && (
        <div style={{ maxWidth: '800px', margin: '20px auto' }}>
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '30px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
          }}>
            <h2 style={{ margin: '0 0 20px', color: '#333' }}>
              🔬 Discovery Mode
            </h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>
              Enter any topic and NEXUS will cross-pollinate it with unrelated fields to generate breakthrough ideas.
            </p>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Enter a topic (e.g., solar panels, cancer research, education)"
                style={{
                  flex: 1,
                  padding: '15px 20px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '12px',
                  fontSize: '16px',
                  outline: 'none'
                }}
                onKeyDown={(e) => e.key === 'Enter' && topic && !isDiscovering && runDiscovery()}
              />
              <button
                onClick={runDiscovery}
                disabled={!topic || isDiscovering}
                style={{
                  padding: '15px 30px',
                  background: isDiscovering ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: isDiscovering ? 'not-allowed' : 'pointer',
                  fontWeight: '700',
                  fontSize: '15px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {isDiscovering ? <Loader size={18} className="animate-spin" /> : <Zap size={18} />}
                {isDiscovering ? 'Discovering...' : 'Run Discovery Engine'}
              </button>
            </div>

            {/* Progress */}
            {progress && (
              <div style={{
                padding: '15px',
                background: '#f8f9ff',
                borderRadius: '10px',
                color: '#667eea',
                fontWeight: '600',
                marginBottom: '20px'
              }}>
                {progress}
              </div>
            )}

            {/* Results */}
            {results && (
              <div>
                <div style={{
                  background: '#f0f4ff',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '15px'
                }}>
                  <h3 style={{ color: '#667eea', margin: '0 0 10px' }}>
                    <Brain size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                    Deep Analysis
                  </h3>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#333' }}>
                    {results.mainAnalysis}
                  </div>
                </div>

                <div style={{
                  background: '#f0fff4',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '15px'
                }}>
                  <h3 style={{ color: '#38a169', margin: '0 0 10px' }}>
                    <Network size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                    Cross-Pollination Fields
                  </h3>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#333' }}>
                    {results.crossFields}
                  </div>
                </div>

                <div style={{
                  background: '#fffbf0',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '15px'
                }}>
                  <h3 style={{ color: '#d69e2e', margin: '0 0 10px' }}>
                    <Lightbulb size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                    Breakthrough Ideas
                  </h3>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#333' }}>
                    {results.breakthroughs}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button
                    onClick={() => {
                      const report = `NEXUS DISCOVERY REPORT\nTopic: ${topic}\n\n--- DEEP ANALYSIS ---\n${results.mainAnalysis}\n\n--- CROSS-POLLINATION FIELDS ---\n${results.crossFields}\n\n--- BREAKTHROUGH IDEAS ---\n${results.breakthroughs}`;
                      navigator.clipboard.writeText(report);
                    }}
                    style={{
                      flex: 1,
                      padding: '14px',
                      background: 'white',
                      border: '2px solid #667eea',
                      borderRadius: '10px',
                      color: '#667eea',
                      fontWeight: '600',
                      cursor: 'pointer',
                      fontSize: '15px'
                    }}
                  >
                    📋 Copy Full Report
                  </button>
                  <button
                    onClick={() => { setResults(null); setTopic(''); setProgress(''); }}
                    style={{
                      flex: 1,
                      padding: '14px',
                      background: 'white',
                      border: '2px solid #764ba2',
                      borderRadius: '10px',
                      color: '#764ba2',
                      fontWeight: '600',
                      cursor: 'pointer',
                      fontSize: '15px'
                    }}
                  >
                    ⚡ New Discovery
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Synthesis & Radar Coming Soon */}
      {(mode === 'synthesis' || mode === 'radar') && (
        <div style={{
          maxWidth: '800px',
          margin: '20px auto',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '20px',
          padding: '60px',
          textAlign: 'center',
          color: 'white'
        }}>
          <div style={{ fontSize: '60px', marginBottom: '20px' }}>
            {mode === 'synthesis' ? '🔗' : '📡'}
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', marginBottom: '10px' }}>
            {mode === 'synthesis' ? 'Synthesis Mode' : 'Radar Mode'} Coming Soon
          </div>
          <div style={{ fontSize: '16px', opacity: 0.8 }}>
            {mode === 'synthesis'
              ? 'Upload multiple sources and discover connections between them'
              : 'Monitor your industry 24/7 for breakthrough opportunities'}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        maxWidth: '1200px',
        margin: '20px auto 0',
        textAlign: 'center',
        color: 'white',
        fontSize: '14px',
        opacity: 0.8
      }}>
        <div style={{ marginBottom: '10px' }}>NEXUS • The Breakthrough Discovery Engine</div>
        <div style={{ fontSize: '12px' }}>
          Powered by Claude Pro's Advanced Capabilities
        </div>
      </div>
    </div>
  );
};

export default NexusApp;
