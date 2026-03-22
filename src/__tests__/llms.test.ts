import { describe, it, expect } from 'vitest';
import { escapeXml, stripHtml } from '../main/llms';

describe('escapeXml', () => {
  it('passes through a clean URL unchanged', () => {
    expect(escapeXml('https://example.com/page/')).toBe('https://example.com/page/');
  });

  it('escapes ampersands', () => {
    expect(escapeXml('a&b')).toBe('a&amp;b');
  });

  it('escapes angle brackets', () => {
    expect(escapeXml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeXml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeXml("it's")).toBe("it&apos;s");
  });

  it('handles a URL with query parameters containing ampersands', () => {
    expect(escapeXml('https://example.com/?a=1&b=2')).toBe(
      'https://example.com/?a=1&amp;b=2',
    );
  });
});

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello');
  });

  it('removes nested tags', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  it('decodes &amp;', () => {
    expect(stripHtml('&amp;')).toBe('&');
  });

  it('decodes &lt; and &gt;', () => {
    expect(stripHtml('&lt;p&gt;')).toBe('<p>');
  });

  it('decodes &quot;', () => {
    expect(stripHtml('&quot;')).toBe('"');
  });

  it('decodes &nbsp; as a space', () => {
    expect(stripHtml('a&nbsp;b')).toBe('a b');
  });

  it('collapses multiple whitespace characters into one', () => {
    expect(stripHtml('<p>a</p>   <p>b</p>')).toBe('a b');
  });

  it('trims leading and trailing whitespace', () => {
    expect(stripHtml('  hello  ')).toBe('hello');
  });

  it('returns an empty string for empty input', () => {
    expect(stripHtml('')).toBe('');
  });

  it('decodes numeric entities like &#8217; (WordPress smart apostrophe)', () => {
    expect(stripHtml('it&#8217;s')).toBe("it\u2019s");
  });

  it('decodes &#8220; and &#8221; (WordPress smart double quotes)', () => {
    expect(stripHtml('&#8220;hello&#8221;')).toBe('\u201chello\u201d');
  });

  it('decodes &#039; (legacy numeric single quote)', () => {
    expect(stripHtml('it&#039;s')).toBe("it's");
  });
});
