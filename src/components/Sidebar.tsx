import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

interface RunInfo {
  currentSum: number;
  targetSum: number;
  isOver: boolean;
  isComplete: boolean;
  count: number;
  combos: number[][];
}

interface SidebarProps {
  runsInfo: { h: RunInfo; v: RunInfo } | null;
}

export function Sidebar({ runsInfo }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<'runs' | 'guide'>('runs');

  return (
    <div className="panel-card" style={{ flexGrow: 1 }}>
      <div className="tab-headers" role="tablist">
        <button
          className={`tab-btn ${activeTab === 'runs' ? 'active' : ''}`}
          onClick={() => setActiveTab('runs')}
          role="tab"
          aria-selected={activeTab === 'runs'}
        >
          Run Inspector
        </button>
        <button
          className={`tab-btn ${activeTab === 'guide' ? 'active' : ''}`}
          onClick={() => setActiveTab('guide')}
          role="tab"
          aria-selected={activeTab === 'guide'}
        >
          Tactics Guide
        </button>
      </div>

      {activeTab === 'runs' && (
        <div className="inspector-detail">
          {runsInfo ? (
            <>
              <div className="inspector-row">
                <div className="inspector-label">
                  <ChevronRight size={14} className="text-purple-400" />
                  <span>Horizontal Row (Across)</span>
                </div>
                <div className="inspector-values">
                  <span
                    className={`inspector-sum ${
                      runsInfo.h.isOver
                        ? 'over'
                        : runsInfo.h.isComplete
                        ? 'complete'
                        : 'normal'
                    }`}
                  >
                    {runsInfo.h.currentSum}
                  </span>
                  <span className="inspector-target">/ {runsInfo.h.targetSum}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    ({runsInfo.h.count} squares)
                  </span>
                </div>
              </div>
              {runsInfo.h.combos.length > 0 && (
                <div style={{ marginTop: '-0.25rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Valid combinations for {runsInfo.h.targetSum}-in-{runsInfo.h.count}:
                  </span>
                  <div className="combos-list" style={{ marginTop: '0.25rem', maxHeight: '80px' }}>
                    {runsInfo.h.combos.map((combo, idx) => (
                      <div key={idx} className="combo-item" style={{ padding: '0.2rem 0.4rem' }}>
                        <span className="combo-vals" style={{ fontSize: '0.75rem' }}>
                          {combo.join(', ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="inspector-row">
                <div className="inspector-label">
                  <ChevronRight size={14} className="text-blue-400" style={{ transform: 'rotate(90deg)' }} />
                  <span>Vertical Column (Down)</span>
                </div>
                <div className="inspector-values">
                  <span
                    className={`inspector-sum ${
                      runsInfo.v.isOver
                        ? 'over'
                        : runsInfo.v.isComplete
                        ? 'complete'
                        : 'normal'
                    }`}
                  >
                    {runsInfo.v.currentSum}
                  </span>
                  <span className="inspector-target">/ {runsInfo.v.targetSum}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    ({runsInfo.v.count} squares)
                  </span>
                </div>
              </div>
              {runsInfo.v.combos.length > 0 && (
                <div style={{ marginTop: '-0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Valid combinations for {runsInfo.v.targetSum}-in-{runsInfo.v.count}:
                  </span>
                  <div className="combos-list" style={{ marginTop: '0.25rem', maxHeight: '80px' }}>
                    {runsInfo.v.combos.map((combo, idx) => (
                      <div key={idx} className="combo-item" style={{ padding: '0.2rem 0.4rem' }}>
                        <span className="combo-vals" style={{ fontSize: '0.75rem' }}>
                          {combo.join(', ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p
              style={{
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                margin: '2rem 0',
              }}
            >
              Click on any white square to inspect its current vertical &amp; horizontal run
              constraints!
            </p>
          )}
        </div>
      )}

      {activeTab === 'guide' && (
        <div className="tutorial-content" style={{ maxHeight: '280px', overflowY: 'auto' }}>
          <p>
            Learn these crucial <strong>unique partitions</strong> to solve puzzles faster:
          </p>
          <div className="combos-list">
            <div className="combo-item">
              <span className="combo-clue">Sum 3 (in 2)</span>
              <span className="combo-vals">1, 2</span>
            </div>
            <div className="combo-item">
              <span className="combo-clue">Sum 4 (in 2)</span>
              <span className="combo-vals">1, 3</span>
            </div>
            <div className="combo-item">
              <span className="combo-clue">Sum 16 (in 2)</span>
              <span className="combo-vals">7, 9</span>
            </div>
            <div className="combo-item">
              <span className="combo-clue">Sum 17 (in 2)</span>
              <span className="combo-vals">8, 9</span>
            </div>
            <div className="combo-item">
              <span className="combo-clue">Sum 6 (in 3)</span>
              <span className="combo-vals">1, 2, 3</span>
            </div>
            <div className="combo-item">
              <span className="combo-clue">Sum 7 (in 3)</span>
              <span className="combo-vals">1, 2, 4</span>
            </div>
            <div className="combo-item">
              <span className="combo-clue">Sum 23 (in 3)</span>
              <span className="combo-vals">6, 8, 9</span>
            </div>
            <div className="combo-item">
              <span className="combo-clue">Sum 24 (in 3)</span>
              <span className="combo-vals">7, 8, 9</span>
            </div>
            <div className="combo-item">
              <span className="combo-clue">Sum 10 (in 4)</span>
              <span className="combo-vals">1, 2, 3, 4</span>
            </div>
            <div className="combo-item">
              <span className="combo-clue">Sum 30 (in 4)</span>
              <span className="combo-vals">6, 7, 8, 9</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
