import { useState, useEffect, useRef, useMemo } from "react";
import { Flame, Wind, Clock, FlaskConical, Sparkles, Hand, StopCircle } from "lucide-react";
import type { AlchemyParams, AlchemyResult, ElixirQuality, FireLevel } from "@/types/game";
import { HERBS, ELIXIR_QUALITY_NAMES, ELIXIR_QUALITY_EMOJIS, ELIXIR_QUALITY_COLORS, FIRE_LEVEL_NAMES, FIRE_LEVEL_EMOJIS } from "@/data/gameData";

interface AlchemyFurnaceProps {
  herbIds: string[];
  alchemyParams: AlchemyParams | null;
  onComplete: (result: AlchemyResult) => void;
  disabled?: boolean;
}

const FIRE_LEVELS: FireLevel[] = ["low", "medium", "high", "violent"];
const FIRE_ORDER: Record<FireLevel, number> = { low: 0, medium: 1, high: 2, violent: 3 };

function calcFireScore(
  fireHistory: { level: FireLevel; duration: number }[],
  optimal: FireLevel,
  tolerance: number
): number {
  const totalTime = fireHistory.reduce((s, h) => s + h.duration, 0);
  if (totalTime === 0) return 0;
  const optimalIdx = FIRE_ORDER[optimal];
  let score = 0;
  for (const h of fireHistory) {
    const diff = Math.abs(FIRE_ORDER[h.level] - optimalIdx);
    const ratio = h.duration / totalTime;
    if (diff <= tolerance) {
      score += ratio * (1 - diff / (tolerance + 1) * 0.4);
    } else {
      const penalty = Math.min(1, (diff - tolerance) * 0.5);
      score += ratio * Math.max(0, 1 - penalty);
    }
  }
  return Math.round(score * 100);
}

function calcStirScore(stirs: number, optimal: number, tolerance: number): number {
  const diff = Math.abs(stirs - optimal);
  if (diff === 0) return 100;
  if (diff <= tolerance) {
    return Math.round(100 - (diff / tolerance) * 25);
  }
  return Math.max(0, Math.round(75 - (diff - tolerance) * 8));
}

function calcTimingScore(elapsed: number, optimal: number, tolerance: number): number {
  const diff = Math.abs(elapsed - optimal);
  if (diff === 0) return 100;
  if (diff <= tolerance) {
    return Math.round(100 - (diff / tolerance) * 20);
  }
  return Math.max(0, Math.round(80 - (diff - tolerance) * 4));
}

function determineQuality(totalScore: number, fireScore: number): ElixirQuality {
  if (fireScore < 25) return "burnt";
  if (totalScore >= 88) return "supreme";
  if (totalScore >= 70) return "fine";
  if (totalScore >= 40) return "common";
  return "burnt";
}

export function AlchemyFurnace({ herbIds, alchemyParams, onComplete, disabled }: AlchemyFurnaceProps) {
  const [isRefining, setIsRefining] = useState(false);
  const [fireLevel, setFireLevel] = useState<FireLevel>("medium");
  const [stirCount, setStirCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<AlchemyResult | null>(null);
  const [stirAnim, setStirAnim] = useState(false);

  const fireHistoryRef = useRef<{ level: FireLevel; duration: number }[]>([]);
  const lastTickRef = useRef<number>(0);
  const intervalRef = useRef<number | null>(null);

  const params = alchemyParams;

  const herbs = useMemo(() => {
    return herbIds.map(id => HERBS.find(h => h.id === id)).filter(Boolean);
  }, [herbIds]);

  const progressPct = useMemo(() => {
    if (!params) return 0;
    return Math.min(100, (elapsed / params.optimalDuration) * 100);
  }, [elapsed, params]);

  const bubbleIntensity = useMemo(() => {
    const base = FIRE_ORDER[fireLevel] * 0.3;
    const stirBonus = stirCount > 0 ? 0.2 : 0;
    return Math.min(1, base + stirBonus);
  }, [fireLevel, stirCount]);

  const startRefining = () => {
    if (disabled || !params || herbIds.length === 0) return;
    setIsRefining(true);
    setFireLevel("medium");
    setStirCount(0);
    setElapsed(0);
    setResult(null);
    fireHistoryRef.current = [{ level: "medium", duration: 0 }];
    lastTickRef.current = Date.now();
  };

  const takeOut = () => {
    if (!isRefining || !params) return;
    setIsRefining(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const lastHist = fireHistoryRef.current[fireHistoryRef.current.length - 1];
    if (lastHist) lastHist.duration += elapsed - fireHistoryRef.current.reduce((s, h) => s + h.duration, 0);

    const fireScore = calcFireScore(fireHistoryRef.current, params.optimalFire, params.fireTolerance);
    const stirScore = calcStirScore(stirCount, params.optimalStirs, params.stirTolerance);
    const timingScore = calcTimingScore(elapsed, params.optimalDuration, params.durationTolerance);
    const totalScore = Math.round(fireScore * 0.35 + stirScore * 0.3 + timingScore * 0.35);
    const quality = determineQuality(totalScore, fireScore);

    const alchemyResult: AlchemyResult = {
      quality,
      qualityScore: totalScore,
      fireScore,
      stirScore,
      timingScore,
    };
    setResult(alchemyResult);
    onComplete(alchemyResult);
  };

  const handleFireChange = (level: FireLevel) => {
    if (!isRefining || disabled) return;
    const now = Date.now();
    const delta = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;
    const lastHist = fireHistoryRef.current[fireHistoryRef.current.length - 1];
    if (lastHist && lastHist.level === fireLevel) {
      lastHist.duration += delta;
    } else {
      fireHistoryRef.current.push({ level, duration: delta });
    }
    setFireLevel(level);
  };

  const handleStir = () => {
    if (!isRefining || disabled) return;
    setStirCount(prev => prev + 1);
    setStirAnim(true);
    setTimeout(() => setStirAnim(false), 400);
  };

  useEffect(() => {
    if (!isRefining) return;
    lastTickRef.current = Date.now();
    intervalRef.current = window.setInterval(() => {
      const now = Date.now();
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      setElapsed(prev => prev + delta);
    }, 100);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRefining]);

  const furnaceColor = useMemo(() => {
    switch (fireLevel) {
      case "low": return "from-red-700 to-orange-500";
      case "medium": return "from-orange-600 to-yellow-400";
      case "high": return "from-yellow-500 to-yellow-200";
      case "violent": return "from-yellow-300 to-white";
    }
  }, [fireLevel]);

  const liquidColor = useMemo(() => {
    if (result) {
      switch (result.quality) {
        case "burnt": return "from-gray-800 to-gray-600";
        case "common": return "from-green-600 to-green-400";
        case "fine": return "from-emerald-500 to-cyan-300";
        case "supreme": return "from-amber-400 to-yellow-200";
      }
    }
    if (herbs.length === 0) return "from-gray-300 to-gray-200";
    const first = herbs[0];
    switch (first?.element) {
      case "fire": return "from-red-500 to-orange-300";
      case "water": return "from-blue-500 to-cyan-300";
      case "wood": return "from-green-600 to-emerald-400";
      case "thunder": return "from-yellow-400 to-amber-200";
      case "earth": return "from-amber-700 to-yellow-600";
      case "light": return "from-yellow-300 to-white";
      case "dark": return "from-purple-700 to-indigo-500";
      default: return "from-green-500 to-teal-300";
    }
  }, [result, herbs]);

  if (!params) {
    return (
      <div className="card p-4 border-clinic-border/40">
        <div className="text-center text-gray-500 text-sm py-8">
          <FlaskConical className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p>选择正确的药方后即可开始炼丹</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4 border-clinic-amber/30 bg-gradient-to-br from-amber-50/50 via-white to-orange-50/30">
      <div className="font-display text-sm text-clinic-deep flex items-center gap-1.5 mb-3">
        <Sparkles className="w-4 h-4 text-clinic-amber" />
        小丹炉 — 炼制药剂
        {result && (
          <span className={`ml-auto tag border ${ELIXIR_QUALITY_COLORS[result.quality]}`}>
            {ELIXIR_QUALITY_EMOJIS[result.quality]} {ELIXIR_QUALITY_NAMES[result.quality]}
          </span>
        )}
      </div>

      <div className="flex justify-center mb-4">
        <div className="relative w-40 h-36">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-36 h-28">
            <div className={`absolute inset-0 rounded-b-full border-4 border-stone-600 bg-gradient-to-b from-stone-500 to-stone-700 shadow-inner`}>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-24 h-16 rounded-b-full overflow-hidden">
                <div className={`absolute inset-0 bg-gradient-to-t ${liquidColor} transition-colors duration-500`} style={{ height: `${Math.min(70, 40 + progressPct * 0.3)}%`, bottom: 0, top: 'auto' }}>
                  <div className="absolute inset-0 opacity-50">
                    {bubbleIntensity > 0 && [...Array(Math.ceil(bubbleIntensity * 8))].map((_, i) => (
                      <div
                        key={i}
                        className="absolute w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce"
                        style={{
                          left: `${15 + (i * 10) % 70}%`,
                          bottom: `${10 + (i * 17) % 60}%`,
                          animationDelay: `${i * 0.2}s`,
                          animationDuration: `${0.8 + (i % 3) * 0.3}s`,
                        }}
                      />
                    ))}
                  </div>
                  {stirAnim && (
                    <div className="absolute inset-0 bg-white/30 animate-pulse" />
                  )}
                </div>
              </div>
              <div className="absolute top-2 left-2 w-4 h-4 rounded-full bg-stone-800/30" />
              <div className="absolute top-4 right-3 w-3 h-3 rounded-full bg-stone-800/20" />
            </div>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-6 bg-gradient-to-b from-stone-600 to-stone-700 rounded-t-lg border-2 border-b-0 border-stone-600">
              <div className="absolute top-1 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-stone-500" />
            </div>
          </div>

          <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-28 h-6 rounded-full bg-gradient-to-t ${furnaceColor} blur-sm opacity-80 transition-all duration-300`} />

          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
            {FIRE_LEVELS.map((lvl, i) => {
              const active = fireLevel === lvl && isRefining;
              return (
                <div
                  key={lvl}
                  className={`transition-all duration-300 ${active ? "opacity-100" : "opacity-20"}`}
                  style={{ fontSize: `${0.8 + i * 0.2}rem` }}
                >
                  {active ? "🔥" : "◦"}
                </div>
              );
            })}
          </div>

          {result && (
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-4xl animate-bounce">
              {ELIXIR_QUALITY_EMOJIS[result.quality]}
            </div>
          )}
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> 炼制时间
          </span>
          <span className="tabular-nums">{elapsed.toFixed(1)}s / {params.optimalDuration}s</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r from-clinic-jade to-clinic-amber transition-all duration-100 ${progressPct > 120 ? "animate-pulse" : ""}`}
            style={{ width: `${Math.min(100, progressPct)}%` }}
          />
        </div>
        {progressPct > 100 && (
          <div className="text-[10px] text-clinic-crisis text-right mt-1">⚠️ 已超过最佳出炉时间</div>
        )}
      </div>

      <div className="mb-3">
        <div className="text-xs text-gray-500 mb-1.5 flex items-center gap-1">
          <Flame className="w-3 h-3" /> 火候控制
        </div>
        <div className="grid grid-cols-4 gap-1">
          {FIRE_LEVELS.map((lvl) => (
            <button
              key={lvl}
              onClick={() => handleFireChange(lvl)}
              disabled={!isRefining || disabled}
              className={`p-1.5 rounded-lg border text-center transition-all ${
                fireLevel === lvl
                  ? "border-clinic-amber bg-clinic-amber/20 shadow-sm"
                  : "border-gray-200 bg-white hover:border-clinic-amber/50"
              } ${!isRefining || disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="text-sm">{FIRE_LEVEL_EMOJIS[lvl].charAt(0)}</div>
              <div className="text-[10px] text-gray-600">{FIRE_LEVEL_NAMES[lvl]}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-1.5 flex items-center gap-1">
          <Hand className="w-3 h-3" /> 搅拌次数：{stirCount} 次
          <span className="ml-auto text-[10px]">最佳约 {params.optimalStirs} 次</span>
        </div>
        <button
          onClick={handleStir}
          disabled={!isRefining || disabled}
          className={`w-full py-2 rounded-lg border-2 transition-all ${
            isRefining && !disabled
              ? "border-clinic-jade bg-clinic-jade/10 hover:bg-clinic-jade/20 text-clinic-deep active:scale-95"
              : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
          }`}
        >
          <Wind className="w-4 h-4 inline mr-1" />
          搅拌一下
        </button>
      </div>

      <div className="flex gap-2">
        {!isRefining && !result && (
          <button
            onClick={startRefining}
            disabled={disabled || herbIds.length === 0}
            className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-clinic-amber to-orange-400 text-white font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            <Flame className="w-4 h-4 inline mr-1" />
            点火开炼
          </button>
        )}
        {isRefining && (
          <button
            onClick={takeOut}
            className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-clinic-jade to-emerald-500 text-white font-medium shadow-md hover:shadow-lg transition-all active:scale-95"
          >
            <StopCircle className="w-4 h-4 inline mr-1" />
            出炉！
          </button>
        )}
        {result && (
          <div className="flex-1 space-y-1">
            <div className="text-[11px] text-gray-500 flex justify-between">
              <span>综合评分</span>
              <span className="font-bold text-clinic-deep">{result.qualityScore}分</span>
            </div>
            <div className="text-[10px] text-gray-500 grid grid-cols-3 gap-1">
              <span>火候 {result.fireScore}</span>
              <span>搅拌 {result.stirScore}</span>
              <span>时机 {result.timingScore}</span>
            </div>
          </div>
        )}
      </div>

      {result && (
        <div className={`mt-3 p-2 rounded-lg border ${ELIXIR_QUALITY_COLORS[result.quality]} text-[11px]`}>
          {result.quality === "supreme" && "🌟 极品丹药！药效非凡，患者服用后恢复神速！"}
          {result.quality === "fine" && "💎 精良品质，药效纯正，治疗效果显著提升。"}
          {result.quality === "common" && "🧪 普通药剂，勉强能用，疗效中规中矩。"}
          {result.quality === "burnt" && "💀 炼成焦糊了... 火候没控制好，药效大减。"}
        </div>
      )}
    </div>
  );
}
