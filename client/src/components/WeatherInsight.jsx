import Icon from './Icon.jsx';

const ROWS = [
  ['hours_humidity_gt90', 'Hours above 90% humidity', ''],
  ['total_rainfall_mm', 'Total rainfall', ' mm'],
  ['rainy_days', 'Rainy days', ''],
  ['mean_night_min_c', 'Mean night minimum', ' °C'],
  ['mean_humidity_pct', 'Mean humidity', '%'],
];
const show = (v, unit) => (v === null || v === undefined ? '–' : `${v}${unit}`);

export default function WeatherInsight({ weather, hasLocation }) {
  if (!weather) {
    return (
      <section className="panel panel--quiet" aria-label="Weather context">
        <h2><Icon name="cloud" size={20} /> Weather context</h2>
        <p className="muted">
          {hasLocation ? "Weather context isn't available right now. Your diagnosis above does not depend on it." : 'Add a location to see weather context for your field.'}
        </p>
      </section>
    );
  }
  const { past_7d: past, next_7d: next } = weather.features;
  return (
    <section className="panel" aria-label="Weather context">
      <h2><Icon name="cloud" size={20} /> Weather context <span className="badge">Rule-based · not part of the AI diagnosis</span></h2>
      <p>{weather.context_note}</p>
      <div className="notice notice--warn" role="note">
        <Icon name="alert" size={20} />
        <div><strong>7-day outlook</strong><p>{weather.risk_alert}</p></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th scope="col">Measure</th><th scope="col">Past 7 days</th><th scope="col">Next 7 days</th></tr></thead>
          <tbody>
            {ROWS.map(([k, label, unit]) => (
              <tr key={k}><th scope="row">{label}</th><td>{show(past[k], unit)}</td><td>{show(next[k], unit)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Source: {weather.source}. Next-7-day values are forecasts.</p>
    </section>
  );
}
