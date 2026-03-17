import * as React from 'react';
import { SiteConfig } from '../shared/types';

interface Props {
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
        hint='The project slug in Cloudflare Pages (e.g. "my-site"). Will be created on first deploy if it does not exist.'
        value={form.cfProjectName}
        onChange={(v) => handleChange('cfProjectName', v)}
      />

      <Field
        label="Public URL"
        hint='The canonical URL of your live site (e.g. "https://example.com"). Used in sitemap.xml and robots.txt.'
        placeholder="https://example.com"
        value={form.publicUrl}
        onChange={(v) => handleChange('publicUrl', v)}
      />

      <Field
        label="Static Output Directory"
        hint="The full path to Staatic's local directory output. Find it in Staatic → Settings → Publishing in your WordPress admin."
        placeholder="/Users/you/Local Sites/yoursite/app/public/wp-content/uploads/staatic/deploy"
        value={form.staticOutputDir}
        onChange={(v) => handleChange('staticOutputDir', v)}
      />

      <div style={styles.field}>
        <label style={styles.label} htmlFor="customRedirects">Custom Redirects</label>
        <textarea
          id="customRedirects"
          value={form.customRedirects}
          onChange={(e) => handleChange('customRedirects', e.target.value)}
          placeholder={`/old-page/ /new-page/ 301\n/another/ / 302`}
          rows={5}
          style={styles.textarea}
          autoComplete="off"
          spellCheck={false}
        />
        <p style={styles.hint}>
          Cloudflare Pages redirect rules, one per line. Prepended to the generated _redirects file on each deploy.
          Format: <code>/from/ /to/ STATUS</code>
        </p>
      </div>

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
  textarea: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d0d0d0',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'monospace',
    boxSizing: 'border-box' as const,
    resize: 'vertical' as const,
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
