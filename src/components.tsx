import { FC, ReactNode, useMemo, useState, useEffect, Component, ErrorInfo, memo, SelectHTMLAttributes } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CalculatedKpis, KpiThresholds, CounterpartyRwa, CET1CapitalBreakdown, Deadline } from './types';
import { formatDate, formatNumber } from './utils';
import { PALETTE, CHART_COLORS } from './theme';

// --- ERROR BOUNDARY ---
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="container mx-auto p-8 text-center">
          <Card>
            <h1 className="text-2xl font-bold text-red-600 mb-4">Oops! Something went wrong.</h1>
            <p className="text-brand-text-secondary mb-6">An unexpected error occurred. Please try refreshing the page.</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-brand-primary hover:bg-brand-primary-dark text-white font-bold py-2 px-6 rounded-lg transition-colors"
            >
              Refresh Page
            </button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- LAYOUT ---

export const Card: FC<{ children: ReactNode; className?: string }> = memo(({
  children,
  className = '',
}) => (
  <div className={`bg-white p-6 rounded-lg shadow-card border border-efg-line ${className}`}>
    {children}
  </div>
));
Card.displayName = 'Card';


export const PageHeader: FC<{
  icon: ReactNode;
  title: string;
  subtitle:string;
}> = memo(({ icon, title, subtitle }) => (
  <div className="mb-8 pb-5 border-b border-efg-line">
    <h1 className="text-3xl md:text-4xl font-light text-brand-text-primary flex items-center gap-3 tracking-tight">
      {icon && <span className="text-2xl flex items-center justify-center opacity-80">{icon}</span>}
      {title}
    </h1>
    <p className="text-base text-brand-text-secondary mt-2 font-light">{subtitle}</p>
  </div>
));
PageHeader.displayName = 'PageHeader';

/**
 * Ruled section header in the EFG slide style: a bold-ish title with an optional
 * light-weight muted suffix (e.g. "(in CHF mn)") above a hairline rule.
 */
export const SectionHeader: FC<{
  title: string;
  suffix?: string;
  className?: string;
}> = memo(({ title, suffix, className = '' }) => (
  <div className={`mb-5 pb-2 border-b border-brand-text-primary/80 ${className}`}>
    <h2 className="text-lg font-semibold text-brand-text-primary">
      {title}
      {suffix && <span className="ml-2 text-sm font-light text-brand-text-secondary">{suffix}</span>}
    </h2>
  </div>
));
SectionHeader.displayName = 'SectionHeader';

/** Red-square bullet list, as used in the EFG "Key highlights" panels. */
export const BulletList: FC<{ items: ReactNode[]; className?: string }> = memo(({ items, className = '' }) => (
  <ul className={`efg-bullets text-sm text-brand-text-secondary leading-relaxed ${className}`}>
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
));
BulletList.displayName = 'BulletList';

export const BackButton: FC = memo(() => {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(-1)}
      className="mb-4 text-sm text-brand-secondary hover:underline flex items-center gap-1"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M15 19l-7-7 7-7"
        />
      </svg>
      Back
    </button>
  );
});
BackButton.displayName = 'BackButton';


export const InfoBox: FC<{
  children: ReactNode;
  title?: string;
  className?: string;
}> = memo(({ children, title, className = '' }) => (
  <div
    className={`bg-brand-bg-body border-l-2 border-brand-primary p-4 my-6 rounded-r ${className}`}
  >
    {title && (
      <h3 className="font-semibold text-brand-text-primary mb-1">{title}</h3>
    )}
    <div className="text-sm text-brand-text-secondary leading-relaxed">{children}</div>
  </div>
));
InfoBox.displayName = 'InfoBox';

export const DeadlineNotificationBanner: FC<{ count: number; onDismiss: () => void }> = memo(({ count, onDismiss }) => {
    return (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6 rounded-r-lg shadow-md flex justify-between items-center animate-fade-in">
            <div>
                <p className="font-bold">Heads Up!</p>
                <p>You have {count} deadline{count > 1 ? 's' : ''} approaching within the next 7 days. <Link to="/deadlines" className="font-semibold underline hover:text-yellow-800">Review Deadlines</Link></p>
            </div>
            <button onClick={onDismiss} className="p-1.5 rounded-full hover:bg-yellow-200" aria-label="Dismiss notification">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
});
DeadlineNotificationBanner.displayName = 'DeadlineNotificationBanner';

// --- FORM & MODAL ---

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
}

export const Select: FC<SelectProps> = memo(({ label, children, ...props }) => (
  <div>
    <label
      htmlFor={props.id || props.name}
      className="block text-sm font-medium text-brand-text-secondary mb-1"
    >
      {label}
    </label>
    <select
      {...props}
      className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm bg-white focus:border-brand-primary focus:ring-brand-primary"
    >
      {children}
    </select>
  </div>
));
Select.displayName = 'Select';


export const Modal: FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-brand-text-primary">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

// --- CHARTS ---
export const MultiEntityKpiChart: FC<{ historicalData: CalculatedKpis[], kpiKey: keyof CalculatedKpis, title: string }> = memo(({ historicalData, kpiKey, title }) => {
    const [opacity, setOpacity] = useState<{[key: string]: number}>({});

    const { data, entities } = useMemo(() => {
        const dataByDate = new Map<string, { name: string, originalDate: string, [key: string]: any }>();
        const entitySet = new Set<string>();

        historicalData.forEach(item => {
            const dateLabel = formatDate(item.date);
            if (!dataByDate.has(dateLabel)) {
                dataByDate.set(dateLabel, { name: dateLabel, originalDate: item.date });
            }
            
            const point = dataByDate.get(dateLabel)!;
            const value = parseFloat(item[kpiKey] as string);
            
            if (!isNaN(value)) {
                point[item.entity] = value;
                entitySet.add(item.entity);
            }
        });

        const sortedData = Array.from(dataByDate.values()).sort((a, b) => new Date(a.originalDate).getTime() - new Date(b.originalDate).getTime());

        return {
            data: sortedData,
            entities: Array.from(entitySet)
        };
    }, [historicalData, kpiKey]);

     useEffect(() => {
        setOpacity(entities.reduce((acc, key) => {
            acc[key] = 1;
            return acc;
        }, {} as {[key: string]: number}));
    }, [entities]);

    const handleLegendClick = (data: any) => {
        const { dataKey } = data;
        setOpacity(prev => ({ ...prev, [dataKey]: prev[dataKey] === 1 ? 0.2 : 1 }));
    };

    const COLORS = CHART_COLORS;

    return (
        <div>
            <h3 className="text-base font-semibold text-brand-text-primary mb-4 text-center">{title}</h3>
            <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis unit="%" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number, name: string) => [`${value.toFixed(2)}%`, name]} />
                    <Legend onClick={handleLegendClick} />
                    {entities.map((entity, index) => (
                        <Line
                            key={entity}
                            type="monotone"
                            dataKey={entity}
                            stroke={COLORS[index % COLORS.length]}
                            strokeWidth={1.5}
                            dot={false}
                            activeDot={{ r: 4 }}
                            connectNulls
                            strokeOpacity={opacity[entity] ?? 1}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
});
MultiEntityKpiChart.displayName = 'MultiEntityKpiChart';


export const RwaDoughnutChart: FC<{ data: CalculatedKpis }> = memo(({ data }) => {
  const chartData = [
    { name: 'Credit RWA', value: data.creditRWA },
    { name: 'Market RWA', value: data.marketRWA },
    { name: 'Operational RWA', value: data.opRWA },
    { name: 'Other RWA', value: data.otherRWA || 0 },
  ].filter((d) => d.value > 0);

  const COLORS = CHART_COLORS;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={65}
          fill={PALETTE.slate}
          paddingAngle={5}
          dataKey="value"
        >
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => `${formatNumber(value)} mCHF`} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
});
RwaDoughnutChart.displayName = 'RwaDoughnutChart';

interface ComparisonBarChartProps {
  data: CalculatedKpis[];
  kpiKey: keyof CalculatedKpis;
  kpiName: string;
  threshold?: number;
  color: string;
}

export const ComparisonBarChart: FC<ComparisonBarChartProps> = memo(({
  data,
  kpiKey,
  kpiName,
  threshold,
  color,
}) => {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        value: parseFloat(d[kpiKey] as string),
      })),
    [data, kpiKey]
  );

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={chartData}
        margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
        <XAxis dataKey="entity" tick={{ fontSize: 11 }} />
        <YAxis unit="%" tick={{ fontSize: 11 }} />
        <Tooltip formatter={(value: number) => `${value.toFixed(2)}%`} />
        <Legend />
        {threshold && (
          <ReferenceLine
            y={threshold}
            label={`Min ${threshold}%`}
            stroke="red"
            strokeDasharray="3 3"
          />
        )}
        <Bar dataKey="value" name={kpiName} maxBarSize={60} fill={color} />
      </BarChart>
    </ResponsiveContainer>
  );
});
ComparisonBarChart.displayName = 'ComparisonBarChart';

interface SingleKpiChartProps {
  data: CalculatedKpis[];
  kpiKey: keyof CalculatedKpis;
  title: string;
  thresholds?: KpiThresholds;
}

export const SingleKpiChart: FC<SingleKpiChartProps> = memo(({ data, kpiKey, title, thresholds, }) => {
    const chartData = useMemo(() =>
        data.map((d) => {
            const value = parseFloat(d[kpiKey] as string);
            return {
                date: d.date, // Keep original date for tooltip
                name: formatDate(d.date),
                value: isNaN(value) ? null : value,
            };
        }),
        [data, kpiKey]
    );

    const [yDomainMin, yDomainMax] = useMemo(() => {
        const dataValues = chartData.map(d => d.value).filter(v => v !== null) as number[];
        const allValues = [...dataValues];

        if (thresholds) {
            allValues.push(thresholds.red);
            allValues.push(thresholds.amber);
        }

        if (allValues.length === 0) return [-10, 110];

        const dataMin = Math.min(...allValues);
        const dataMax = Math.max(...allValues);
        
        const range = dataMax - dataMin;
        const topPadding = range === 0 ? 10 : range * 0.2;
        const bottomPadding = range === 0 ? 10 : range * 0.2;

        return [dataMin - bottomPadding, dataMax + topPadding];
    }, [chartData, thresholds]);


    const CustomTooltip: FC<any> = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const dataPoint = chartData.find(d => d.name === label);
            if (!dataPoint) return null;

            return (
                <div className="bg-white p-3 border border-gray-300 rounded shadow-lg text-sm">
                    <p className="font-bold">{formatDate(dataPoint.date)}</p>
                    <p className="text-brand-primary">{`${kpiKey.toUpperCase()}: ${payload[0].value.toFixed(2)}%`}</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-base font-semibold text-brand-text-primary mb-4 text-center">{title}</h3>
            <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis
                        domain={[yDomainMin, yDomainMax]}
                        tickFormatter={(tick) => `${tick.toFixed(0)}%`}
                        allowDataOverflow={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend verticalAlign="bottom" />

                    {thresholds && (
                        <>
                            <ReferenceArea y1={thresholds.amber} y2={yDomainMax} fill="#dcfce7" fillOpacity={0.6} label={{ value: "Green", position: "insideTopLeft", fill: "#15803d", fontSize: 10, dx: 10, dy: 10 }}/>
                            <ReferenceArea y1={thresholds.red} y2={thresholds.amber} fill="#fef9c3" fillOpacity={0.6} label={{ value: "Amber", position: "insideTopLeft", fill: "#ca8a04", fontSize: 10, dx: 10, dy: 10 }} />
                            <ReferenceArea y1={yDomainMin} y2={thresholds.red} fill="#fee2e2" fillOpacity={0.6} label={{ value: "Red", position: "insideTopLeft", fill: "#b91c1c", fontSize: 10, dx: 10, dy: 10 }} />
                        </>
                    )}

                    <Line
                        type="monotone"
                        dataKey="value"
                        name={kpiKey.toString().toUpperCase()}
                        stroke={PALETTE.red}
                        strokeWidth={1.5}
                        dot={{ r: 2.5, strokeWidth: 1.5, fill: '#fff', stroke: PALETTE.red }}
                        activeDot={{ r: 4, stroke: PALETTE.red, fill: PALETTE.red }}
                        connectNulls
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
});
SingleKpiChart.displayName = 'SingleKpiChart';


interface BreakdownBarChartProps {
  title: string;
  color: string;
  data: { name: string; value: number }[];
}

export const BreakdownBarChart: FC<BreakdownBarChartProps> = memo(({
  title,
  color,
  data,
}) => (
  <div>
    <h4 className="font-semibold text-brand-text-primary mb-2">{title}</h4>
    <ResponsiveContainer width="100%" height={180}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
        <XAxis type="number" />
        <YAxis dataKey="name" type="category" width={80} />
        <Tooltip formatter={(value: number) => `${formatNumber(value)} mCHF`} />
        <Bar dataKey="value" fill={color} />
      </BarChart>
    </ResponsiveContainer>
  </div>
));
BreakdownBarChart.displayName = 'BreakdownBarChart';

// --- COMPLEX COMPONENTS ---

interface CalculationStatementProps {
  items: {
    label: string;
    value: number;
    isSubtotal?: boolean;
    isTotal?: boolean;
  }[];
}

export const CalculationStatement: FC<CalculationStatementProps> = memo(({
  items,
}) => (
  <div className="space-y-2 text-sm">
    {items.map((item, index) => {
      const isNegative = item.value < 0;
      const valueDisplay = formatNumber(Math.abs(item.value));

      let itemClass = 'flex justify-between items-center py-2';
      if (item.isSubtotal)
        itemClass += ' border-t border-gray-300 font-semibold';
      if (item.isTotal)
        itemClass += ' border-t-2 border-brand-text-primary font-bold text-base pt-3';

      return (
        <div key={index} className={itemClass}>
          <span>{item.label}</span>
          <span className="font-mono">
            {isNegative ? `(${valueDisplay})` : valueDisplay}
          </span>
        </div>
      );
    })}
  </div>
));
CalculationStatement.displayName = 'CalculationStatement';

interface WaterfallChartProps {
  title: string;
  data: { name: string; value: number }[];
  unit?: string;
}

export const WaterfallChart: FC<WaterfallChartProps> = memo(({
  title,
  data,
  unit = '',
}) => {
  const processedData = useMemo(() => {
    if (data.length === 0) return [];
    let cumulative = 0;
    const result: {
      name: string;
      value: number;
      offset: number;
      isTotal: boolean;
      isNegative: boolean;
    }[] = [];

    data.forEach((item, index) => {
      const isTotal = index === 0 || index === data.length - 1;

      if (isTotal) {
        result.push({
          name: item.name,
          value: item.value,
          offset: 0,
          isTotal: true,
          isNegative: false,
        });
        cumulative = item.value;
      } else {
        const isPositive = item.value >= 0;
        if (isPositive) {
          result.push({
            name: item.name,
            value: item.value,
            offset: cumulative,
            isTotal: false,
            isNegative: false,
          });
          cumulative += item.value;
        } else {
          result.push({
            name: item.name,
            value: -item.value,
            offset: cumulative + item.value,
            isTotal: false,
            isNegative: true,
          });
          cumulative += item.value;
        }
      }
    });
    return result;
  }, [data]);

  const CustomTooltip: FC<any> = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const originalEntry = data.find((d) => d.name === label);
      if (!originalEntry) return null;
      const value = originalEntry.value;

      return (
        <div className="bg-white p-2 border border-gray-300 rounded shadow-lg">
          <p className="font-bold">{label}</p>
          <p
            style={{
              color: payload[1]?.payload?.isTotal
                ? PALETTE.ink
                : value >= 0
                ? PALETTE.slate
                : PALETTE.red,
            }}
          >
            {`${formatNumber(value, 2)}${unit}`}
          </p>
        </div>
      );
    }
    return null;
  };
    
    const CustomLabel = (props: any) => {
        const { x, y, width, height, index } = props;
        const entry = processedData[index];
        const originalEntry = data.find(d => d.name === entry.name);

        if (!originalEntry || entry.isTotal) {
            return null; // Don't show labels for totals
        }

        const originalValue = originalEntry.value;
        const formattedValue = `${formatNumber(originalValue, 2)}${unit}`;
        
        const yPos = originalValue >= 0 ? y - 8 : y + height + 18;
        const textAnchor = "middle";

        return (
            <text x={x + width / 2} y={yPos} fill="#52616A" textAnchor={textAnchor} fontSize={10} fontWeight={600}>
                {formattedValue}
            </text>
        );
    };

  return (
    <div>
      {title && <h3 className="text-base font-semibold text-brand-text-primary mb-4 text-center">{title}</h3>}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={processedData}
          margin={{
            top: 28,
            right: 20,
            left: 10,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis unit={unit} tick={{ fontSize: 11 }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="offset" stackId="a" fill="transparent" />
          <Bar dataKey="value" stackId="a" barSize={26} maxBarSize={26}>
             <LabelList dataKey="value" content={<CustomLabel />} />
            {processedData.map((entry, index) => {
              const color = entry.isTotal
                ? PALETTE.slateDark // Slate for totals
                : entry.isNegative
                ? PALETTE.red
                : PALETTE.slate;
              return <Cell key={`cell-${index}`} fill={color} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
WaterfallChart.displayName = 'WaterfallChart';

interface CapitalEvolutionChartProps {
  data: {
    startData: { date: string; cet1Ratio: number };
    endData: { date: string; cet1Ratio: number };
    deltas: { name: string; value: number }[];
  };
}

export const CapitalEvolutionChart: FC<CapitalEvolutionChartProps> = memo(({
  data,
}) => {
  const waterfallData = useMemo(() => {
    const items = [];
    items.push({ name: formatDate(data.startData.date), value: data.startData.cet1Ratio });
    items.push(...data.deltas);
    items.push({ name: formatDate(data.endData.date), value: data.endData.cet1Ratio });
    return items;
  }, [data]);

  return (
    <div>
        <h3 className="text-base font-semibold text-brand-text-primary mb-2 text-center">Evolution CET1 Capital Ratio</h3>
        <WaterfallChart
            title=""
            data={waterfallData}
            unit="%"
        />
    </div>
  );
});
CapitalEvolutionChart.displayName = 'CapitalEvolutionChart';


export const RiskAppetiteIndicator: FC<{ thresholds?: KpiThresholds, currentValue: number }> = memo(({ thresholds, currentValue }) => {
    if (!thresholds) {
        return <div className="text-xs text-gray-400 mt-2">No risk appetite defined.</div>;
    }

    const { red, amber } = thresholds;
    const max = Math.max(amber * 1.5, currentValue * 1.2, red * 2); // Dynamic scale
    const min = Math.min(red * 0.8, currentValue * 0.8, 0);
    const range = max - min;

    if (range === 0) return null;

    const redWidth = ((red - min) / range) * 100;
    const amberWidth = ((amber - red) / range) * 100;
    const greenWidth = 100 - redWidth - amberWidth;
    const position = ((currentValue - min) / range) * 100;

    return (
        <div className="mt-4">
            <div className="relative h-2 w-full flex rounded-full overflow-hidden">
                <div className="bg-red-500" style={{ width: `${redWidth}%` }}></div>
                <div className="bg-yellow-400" style={{ width: `${amberWidth}%` }}></div>
                <div className="bg-green-500" style={{ width: `${greenWidth}%` }}></div>
                 <div
                    className="absolute top-1/2 -translate-y-1/2 h-4 w-1 bg-gray-800 rounded-full ring-2 ring-white"
                    style={{ left: `calc(${position}% - 2px)` }}
                    title={`Current: ${currentValue.toFixed(2)}%`}
                ></div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{min.toFixed(0)}%</span>
                <span className="text-red-600 font-semibold">Red &lt; {red}%</span>
                <span className="text-yellow-600 font-semibold">Amber &lt; {amber}%</span>
                <span>{max.toFixed(0)}%</span>
            </div>
        </div>
    );
});
RiskAppetiteIndicator.displayName = 'RiskAppetiteIndicator';


interface KpiDetailCardProps {
    icon?: string;
    title: string;
    kpiData: CalculatedKpis;
    kpiKey: keyof CalculatedKpis;
    riskAppetite?: KpiThresholds;
    historicalData: CalculatedKpis[];
    children?: ReactNode;
}

export const KpiDetailCard: FC<KpiDetailCardProps> = memo(({ title, kpiData, kpiKey, riskAppetite, historicalData, children }) => {
    const value = kpiData[kpiKey] as string;

    const ratioLabel = useMemo(() => {
        const map: Record<string, string> = { cet1: 'CET1 Ratio', leverage: 'Leverage Ratio', lcr: 'LCR', nsfr: 'NSFR' };
        return map[kpiKey as string] ?? (kpiKey as string).toUpperCase();
    }, [kpiKey]);

    const detailItems = useMemo(() => {
        switch (kpiKey) {
            case 'cet1':
                return [
                    { label: "CET1 Capital", value: `${formatNumber(kpiData.cet1Capital)} mCHF` },
                    { label: "Total RWA", value: `${formatNumber(kpiData.rwaTotal)} mCHF` }
                ];
            case 'leverage':
                return [
                    { label: "Tier 1 Capital", value: `${formatNumber(kpiData.tier1)} mCHF` },
                    { label: "Total Exposure", value: `${formatNumber(kpiData.exposure)} mCHF` }
                ];
            case 'lcr':
                return kpiData.hqla !== undefined ? [
                    { label: "HQLA", value: `${formatNumber(kpiData.hqla)} m` },
                    { label: "Net Cash Outflows", value: `${formatNumber(kpiData.netCashOutflows!)} m` }
                ] : [];
            case 'nsfr':
                 return value === 'N/A' ? [] : [
                    { label: "Available Stable Funding", value: `${formatNumber(kpiData.asf!)} m` },
                    { label: "Required Stable Funding", value: `${formatNumber(kpiData.rsf!)} m` }
                ];
            default:
                return [];
        }
    }, [kpiData, kpiKey, value]);

    return (
        <Card>
            <SectionHeader title={title} />
            <div className="grid grid-cols-1 md:grid-cols-3 border border-efg-line rounded-lg overflow-hidden mb-6 divide-y md:divide-y-0 md:divide-x divide-efg-line">
                <div className="bg-brand-secondary text-white px-5 py-7 text-center flex flex-col justify-center">
                    <p className="text-[11px] uppercase tracking-[0.15em] text-white/70 mb-2">{ratioLabel}</p>
                    <p className="text-4xl font-light leading-none">
                        {value === 'N/A' ? 'N/A' : <>{value}<span className="text-2xl align-top ml-0.5">%</span></>}
                    </p>
                </div>
                {detailItems.map(item => (
                    <div key={item.label} className="bg-white px-5 py-7 text-center flex flex-col justify-center">
                        <p className="text-[11px] uppercase tracking-[0.15em] text-brand-text-secondary mb-2">{item.label}</p>
                        <p className="text-2xl font-light text-brand-text-primary leading-none">{item.value}</p>
                    </div>
                ))}
            </div>

            <RiskAppetiteIndicator thresholds={riskAppetite} currentValue={parseFloat(value)} />

            {kpiKey === 'cet1' && kpiData.cet1CapitalBreakdown && (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 pt-6 border-t border-gray-200">
                    <div>
                        <h4 className="font-semibold text-brand-text-primary mb-2">CET1 Capital Calculation (mCHF)</h4>
                        <CalculationStatement
                            items={[
                                { label: 'Stated Equity', value: kpiData.cet1CapitalBreakdown.equity },
                                { label: 'P&L', value: kpiData.cet1CapitalBreakdown.pnl },
                                { label: 'Share Buyback', value: -kpiData.cet1CapitalBreakdown.shareBuyback },
                                { label: 'Goodwill & Intangibles', value: -kpiData.cet1CapitalBreakdown.goodwillIntangibles },
                                { label: 'Other Deductions', value: -kpiData.cet1CapitalBreakdown.otherDeductions },
                                { label: 'Dividend', value: -(kpiData.cet1CapitalBreakdown.dividend || 0) },
                                { label: 'Total CET1 Capital', value: kpiData.cet1Capital, isTotal: true },
                            ].filter(item => item.value !== 0 || item.label.includes('Total'))}
                        />
                    </div>
                    <div>
                        <h4 className="font-semibold text-brand-text-primary mb-2">Total RWA Calculation (mCHF)</h4>
                        <CalculationStatement
                            items={[
                                { label: 'Credit RWA', value: kpiData.creditRWA },
                                { label: 'Market RWA', value: kpiData.marketRWA },
                                { label: 'Operational RWA', value: kpiData.opRWA },
                                { label: 'Other RWA', value: kpiData.otherRWA || 0 },
                                { label: 'Total RWA', value: kpiData.rwaTotal, isTotal: true },
                            ].filter(item => item.value !== 0 || item.label.includes('Total'))}
                        />
                    </div>
                </div>
            )}

            <div className="mt-6">
                {children}
            </div>

            <SingleKpiChart
                data={historicalData}
                kpiKey={kpiKey}
                title={`${kpiKey.toUpperCase()} Evolution`}
                thresholds={riskAppetite}
            />
        </Card>
    )
});
KpiDetailCard.displayName = 'KpiDetailCard';

export const HistoricalCompositionTable: FC<{ historicalData: CalculatedKpis[] }> = memo(({ historicalData }) => {
    if (historicalData.length === 0) {
        return <p>No historical data available.</p>;
    }

    const dates = historicalData.map(d => d.date);

    const cet1Rows: { label: string; key: keyof CET1CapitalBreakdown; isNegative?: boolean }[] = [
        { label: 'Stated Equity', key: 'equity' },
        { label: 'PNL', key: 'pnl' },
        { label: 'Less: Share Buyback', key: 'shareBuyback', isNegative: true },
        { label: 'Less: GW & Intangibles', key: 'goodwillIntangibles', isNegative: true },
        { label: 'Less: Other Deductions', key: 'otherDeductions', isNegative: true },
        { label: 'Less: Dividend', key: 'dividend', isNegative: true },
    ];

    const rwaRows: { label: string; key: keyof CalculatedKpis }[] = [
        { label: 'Credit RWA', key: 'creditRWA' },
        { label: 'Market RWA', key: 'marketRWA' },
        { label: 'Operational RWA', key: 'opRWA' },
        { label: 'Other RWA', key: 'otherRWA' },
    ];

    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-lg font-bold text-brand-text-primary mb-4">CET1 Capital Composition (mCHF)</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-brand-text-secondary">
                        <thead className="text-xs text-brand-text-primary uppercase bg-gray-100">
                            <tr>
                                <th className="px-4 py-3 sticky left-0 bg-gray-100 z-10">Component</th>
                                {dates.map(date => <th key={date} className="px-4 py-3 text-right">{formatDate(date)}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {cet1Rows.map((row, rowIndex) => (
                                <tr key={row.label} className={rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                    <td className="px-4 py-2 font-medium text-brand-text-primary sticky left-0 bg-inherit z-10">{row.label}</td>
                                    {historicalData.map(hist => {
                                        const breakdown = hist.cet1CapitalBreakdown;
                                        const value = breakdown ? breakdown[row.key] : null;
                                        const displayValue = value === null || value === undefined ? 'N/A' : formatNumber(row.isNegative ? -value : value);
                                        return <td key={`${hist.date}-${row.key}`} className="px-4 py-2 text-right font-mono">{displayValue}</td>;
                                    })}
                                </tr>
                            ))}
                            <tr className="bg-gray-200 font-bold text-brand-text-primary">
                                <td className="px-4 py-2 sticky left-0 bg-gray-200 z-10">Total CET1 Capital</td>
                                {historicalData.map(hist => (
                                    <td key={`${hist.date}-total`} className="px-4 py-2 text-right font-mono">{formatNumber(hist.cet1Capital)}</td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div>
                 <h3 className="text-lg font-bold text-brand-text-primary mb-4">RWA Composition (mCHF)</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-brand-text-secondary">
                        <thead className="text-xs text-brand-text-primary uppercase bg-gray-100">
                            <tr>
                                <th className="px-4 py-3 sticky left-0 bg-gray-100 z-10">Component</th>
                                {dates.map(date => <th key={date} className="px-4 py-3 text-right">{formatDate(date)}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {rwaRows.map((row, rowIndex) => (
                                <tr key={row.label} className={rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                    <td className="px-4 py-2 font-medium text-brand-text-primary sticky left-0 bg-inherit z-10">{row.label}</td>
                                    {historicalData.map(hist => {
                                        const value = hist[row.key] as number;
                                        return <td key={`${hist.date}-${row.key}`} className="px-4 py-2 text-right font-mono">{formatNumber(value)}</td>;
                                    })}
                                </tr>
                            ))}
                            <tr className="bg-gray-200 font-bold text-brand-text-primary">
                                <td className="px-4 py-2 sticky left-0 bg-gray-200 z-10">Total RWA</td>
                                {historicalData.map(hist => (
                                    <td key={`${hist.date}-total`} className="px-4 py-2 text-right font-mono">{formatNumber(hist.rwaTotal)}</td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
});
HistoricalCompositionTable.displayName = 'HistoricalCompositionTable';

export const TopCounterpartiesTable: FC<{ data: CounterpartyRwa[] }> = memo(({ data }) => {
    const industries = useMemo(() => Array.from(new Set(data.map(d => d.industry))).sort(), [data]);
    const [selectedIndustry, setSelectedIndustry] = useState<CounterpartyRwa['industry'] | ''>(industries[0] || '');

    useEffect(() => {
        const isValidSelection = industries.some(i => i === selectedIndustry);
        if (industries.length > 0 && !isValidSelection) {
            setSelectedIndustry(industries[0]);
        }
    }, [industries, selectedIndustry]);

    const filteredData = useMemo(() => {
        return data
            .filter(d => d.industry === selectedIndustry)
            .sort((a, b) => b.rwa - a.rwa)
            .slice(0, 20);
    }, [data, selectedIndustry]);

    if (data.length === 0) {
        return <InfoBox>No counterparty data available for this entity and date.</InfoBox>;
    }

    return (
        <div>
            <div className="mb-4 max-w-xs">
                <Select label="Industry" value={selectedIndustry} onChange={e => setSelectedIndustry(e.target.value as CounterpartyRwa['industry'])}>
                    {industries.map(i => <option key={i} value={i}>{i}</option>)}
                </Select>
            </div>
            <div className="overflow-x-auto">
                <table>
                    <thead className="text-xs text-brand-text-primary uppercase bg-gray-100">
                        <tr>
                            <th className="px-6 py-3 w-16">Rank</th>
                            <th className="px-6 py-3">Counterparty Name</th>
                            <th className="px-6 py-3 text-right">RWA (mCHF)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredData.length > 0 ? filteredData.map((d, index) => (
                            <tr key={`${d.counterpartyName}-${index}`} className="bg-white border-b hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium text-brand-text-primary text-center">{index + 1}</td>
                                <td className="px-6 py-4 font-medium text-brand-text-primary">{d.counterpartyName}</td>
                                <td className="px-6 py-4 text-right font-mono">{formatNumber(d.rwa)}</td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={3} className="text-center py-8 text-brand-text-secondary">
                                    No counterparties found for the selected industry.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
              </div>
          </div>
    );
});
TopCounterpartiesTable.displayName = 'TopCounterpartiesTable';

export const HqlaEvolutionChart: FC<{ data: CalculatedKpis[] }> = memo(({ data }) => {
    const chartData = useMemo(() => {
        return data.map(d => ({
            name: formatDate(d.date),
            ...d.hqlaBreakdown,
        })).filter(d => d.centralBank !== undefined); // Only include points with breakdown data
    }, [data]);

    if (chartData.length === 0) {
        return <InfoBox>Not enough historical breakdown data for HQLA evolution chart.</InfoBox>;
    }

    const COLORS = {
        centralBank: PALETTE.slate,
        reverseRepo: PALETTE.steel,
        sovereign: PALETTE.red,
        publicSector: PALETTE.mist,
        other: PALETTE.sand,
    };

    const hqlaKeys = Object.keys(COLORS) as (keyof typeof COLORS)[];

    return (
        <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-base font-semibold text-brand-text-primary mb-4 text-center">HQLA Composition Evolution (m)</h3>
            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatNumber(value)} />
                    <Legend />
                    {hqlaKeys.map(key => (
                         <Bar key={key} dataKey={key} stackId="a" maxBarSize={44} fill={COLORS[key]} name={key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}/>
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
});
HqlaEvolutionChart.displayName = 'HqlaEvolutionChart';

export const CashflowEvolutionChart: FC<{ data: CalculatedKpis[]; flowType: 'inflows' | 'outflows' }> = memo(({ data, flowType }) => {
    const chartData = useMemo(() => {
        return data.map(d => {
            if (!d.netCashOutflowsBreakdown) return null;
            const breakdown = d.netCashOutflowsBreakdown[flowType];
            return {
                name: formatDate(d.date),
                ...breakdown,
            };
        }).filter((d): d is { name: string; bankAndFi: number; retail: number; corporate: number; derivatives: number; other: number; } => d !== null && d.bankAndFi !== undefined);
    }, [data, flowType]);

    if (chartData.length === 0) {
        return <InfoBox>Not enough historical breakdown data for {flowType} evolution chart.</InfoBox>;
    }

    const COLORS = {
        bankAndFi: PALETTE.slate,
        retail: PALETTE.red,
        corporate: PALETTE.steel,
        derivatives: PALETTE.mist,
        other: PALETTE.sand,
    };

    const cashflowKeys = Object.keys(COLORS) as (keyof typeof COLORS)[];
    const title = flowType.charAt(0).toUpperCase() + flowType.slice(1);

    return (
        <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-base font-semibold text-brand-text-primary mb-4 text-center">{title} Composition Evolution (30d, m)</h3>
            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatNumber(value)} />
                    <Legend />
                    {cashflowKeys.map(key => (
                         <Bar
                            key={key}
                            dataKey={key}
                            stackId="a"
                            maxBarSize={44}
                            fill={COLORS[key]}
                            name={key.replace(/([A-Z])/g, ' $1').replace('And', ' & ').replace(/^./, str => str.toUpperCase())}
                         />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
});
CashflowEvolutionChart.displayName = 'CashflowEvolutionChart';


// --- NEW SHARED COMPONENTS ---

interface TabButtonProps {
    label: string;
    isActive: boolean;
    onClick: () => void;
    isSubTab?: boolean;
}
export const TabButton: FC<TabButtonProps> = memo(({label, isActive, onClick, isSubTab = false}) => (
    <button
        onClick={onClick}
        className={isSubTab 
            ? `px-3 py-1 text-sm font-semibold rounded-md transition-colors ${isActive ? 'bg-brand-primary text-white shadow' : 'text-brand-text-secondary hover:bg-gray-200'}`
            : `whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${isActive ? 'border-brand-primary text-brand-primary' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`
        }
    >
        {label}
    </button>
));
TabButton.displayName = 'TabButton';

interface SortableHeaderProps {
    label: string;
    sortKey: keyof Deadline;
    sortConfig: { key: keyof Deadline; direction: 'ascending' | 'descending' } | null;
    onSort: (key: keyof Deadline) => void;
}

export const SortableHeader: FC<SortableHeaderProps> = memo(({ label, sortKey, sortConfig, onSort }) => (
    <th scope="col" className="px-6 py-3 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => onSort(sortKey)}>
        {label}
        {sortConfig?.key === sortKey && (
            <span className="ml-1">{sortConfig.direction === 'ascending' ? '▲' : '▼'}</span>
        )}
    </th>
));
SortableHeader.displayName = 'SortableHeader';