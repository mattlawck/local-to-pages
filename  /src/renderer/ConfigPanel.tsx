import * as React from 'react';
import { SiteConfig, ExportPlugin } from '../shared/types';

interface Props {
  siteId: string;
  config: SiteConfig;
  onSave: (config: SiteConfig) => void;
}

export const ConfigPanel: React.FC<Props> = ({ config, onSave }) => {
  const [form, setForm] = React.useState<SiteConfig>(config);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setForm(config);
  }, [config]);

  const handleChange = (field: keyof SiteConfig, value: string) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h3 style={styles.heading}>Cloudflare Pages Settings</h3>

      <div style={styles.field}>
        <label style={styles.label}>Export Plugin</label>
        <div style={styles.radioGroup}>
          {(['staatic', 'simply-static'] as ExportPlugin[]).map((plugin) => (
            <label key={plugin} style={styles.radioLabel}>
              <input
                type="radio"
                name="exportPlugin"
                value={plugin}
                checked={form.exportPlugin === plugin}
                onChange={() => handleChange('exportPlugin', plugin)}
                style={{ marginRight: '6px' }}
              />
              {plugin === 'staatic' ? 'Staatic (free)' : 'Simply Static Pro ($99/yr)'}
            </label>
          ))}
        </div>
        <p style={styles.hint}>
          Both export to a local directory. Staatic is free and includes WP-CLI. Simply Static Pro has native Cloudflare Pages support but we use Wrangler regardless.
        </p>
      </div>

      <Field
        label="CF API Token"
        hint='Create at dash.cloudflare.com → My Profile → API Tokens. Needs "Cloudflare Pages: Edit" permission.'
        type="password"
        value={form.cfApiToken}
        onChange={(v) => handleChange('cfApiToken', v)}
      />

      <Field
        label="CF Account ID"
        hint="Found on the right sidebar of your Cloudflare dashboard homepage."
        value={form.cfAccountId}
        onChange={(v) => handleChange('cfAccountId', v)}
      />

      <Field
        label="Pages Project Name"
        hint='The project slug in Cloudflare Pages (e.g. "mattlawck"). Will be created on first deploy if it does not exist.'
        value={form.cfProjectName}
        onChange={(v) => handleChange('cfProjectName', v)}
      />

      <Field
        label="Static Output Directory"
        hint="The absolute path Simply Static is configured to export to. Found in Simply Static > Settings > Deployment > Local Directory."
        placeholder="/Users/you/Sites/mattlawck/static-export"
        value={form.staticOutputDir}
        onChange={(v) => handleChange('staticOutputDir', v)}
      />

      <button type="submit" style={styles.button}>
        {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </form>
  );
};

interface FieldProps {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}

const Field: React.FC<FieldProps> = ({
  label,
  hint,
  value,
  onChange,
  type = 'text',
  placeholder = '',
}) => (
  <div style={styles.field}>
    <label style={styles.label}>{label}</label>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={styles.input}
      autoComplete="off"
      spellCheck={false}
    />
    <p style={styles.hint}>{hint}</p>
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  form: {
    padding: '20px',
    maxWidth: '600px',
  },
  heading: {
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '20px',
    color: '#1d1d1d',
  },
  field: {
    marginBottom: '18px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    marginBottom: '4px',
    color: '#1d1d1d',
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d0d0d0',
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: 'monospace',
    boxSizing: 'border-box',
  },
  hint: {
    margin: '4px 0 0',
    fontSize: '11px',
    color: '#888',
    lineHeight: '1.4',
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    margin: '6px 0',
  },
  radioLabel: {
    fontSize: '13px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  button: {
    marginTop: '8px',
    padding: '8px 20px',
    background: '#7b61ff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
