import { useState, useMemo } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { getPartitionsCached } from '../partitions';

interface RunInfo {
  currentSum: number;
  targetSum: number;
  isOver: boolean;
  isComplete: boolean;
  count: number;
  combos: number[][];
}

interface Candidates {
  horizontal: number[];
  vertical: number[];
  both: number[];
  isEmpty: boolean;
}

interface SidebarProps {
  runsInfo: { h: RunInfo; v: RunInfo; candidates: Candidates } | null;
}

/**
 * The "unique partitions" a Kakuro player memorises: (sum, length) pairs that
 * admit exactly one combination of distinct digits, so the digit set is
 * forced. Derived from getPartitions rather than hardcoded, so the list is
 * guaranteed complete and correct.
 */
function useUniquePartitions() {
  return useMemo(() => {
    const rows: { sum: number; length: number; digits: number[] }[] = [];
    for (let length = 2; length <= 8; length++) {
      const min = (length * (length + 1)) / 2;
      const max = length * 9 - (length * (length - 1)) / 2;
      for (let sum = min; sum <= max; sum++) {
        const combos = getPartitionsCached(sum, length);
        if (combos.length === 1) {
          rows.push({ sum, length, digits: combos[0] });
        }
      }
    }
    return rows;
  }, []);
}

export function Sidebar({ runsInfo }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<'runs' | 'guide'>('runs');
  const uniquePartitions = useUniquePartitions();

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

              {/* Smart candidates: digits consistent with the current state
                  of both runs (digits already placed in either run are
                  pruned). Highlighted when only one digit survives — that's
                  a forced single, the engine's most direct hint. */}
              {(() => {
                const c = runsInfo.candidates;
                if (c.isEmpty) return null;
                return (
                  <div className="candidates-panel">
                    <div className="candidates-header">
                      <Sparkles size={14} className="text-purple-400" />
                      <span>Smart candidates</span>
                    </div>
                    <div className="candidates-row">
                      <span className="candidates-label">Row:</span>
                      <div className="candidates-digits">
                        {c.horizontal.length === 0 ? (
                          <span className="candidates-none">none</span>
                        ) : (
                          c.horizontal.map(d => (
                            <span key={d} className="candidate-digit">
                              {d}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="candidates-row">
                      <span className="candidates-label">Col:</span>
                      <div className="candidates-digits">
                        {c.vertical.length === 0 ? (
                          <span className="candidates-none">none</span>
                        ) : (
                          c.vertical.map(d => (
                            <span key={d} className="candidate-digit">
                              {d}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="candidates-row both">
                      <span className="candidates-label">Both:</span>
                      <div className="candidates-digits">
                        {c.both.length === 0 ? (
                          <span className="candidates-none">none — board is in an invalid state</span>
                        ) : c.both.length === 1 ? (
                          <span className="candidate-digit forced">{c.both[0]}</span>
                        ) : (
                          c.both.map(d => (
                            <span key={d} className="candidate-digit">
                              {d}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    {c.both.length === 1 && (
                      <div className="candidates-hint">
                        Forced by cross-run elimination.
                      </div>
                    )}
                  </div>
                );
              })()}
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
            Learn these crucial <strong>unique partitions</strong> to solve puzzles faster. Each
            clue below has only one possible set of digits, so the digits are forced:
          </p>
          <div className="combos-list">
            {uniquePartitions.map(({ sum, length, digits }) => (
              <div className="combo-item" key={`${sum}-${length}`}>
                <span className="combo-clue">
                  Sum {sum} (in {length})
                </span>
                <span className="combo-vals">{digits.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
