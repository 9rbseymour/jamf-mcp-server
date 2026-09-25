import { isReadOnlyMode } from '../../utils/read-only.js';
import { JamfApiClientHybrid } from '../../jamf-client-hybrid.js';

describe('isReadOnlyMode', () => {
  it('defaults to read-only when JAMF_READ_ONLY is unset', () => {
    expect(isReadOnlyMode({})).toBe(true);
  });

  it('stays read-only for any value other than "false"', () => {
    expect(isReadOnlyMode({ JAMF_READ_ONLY: 'true' })).toBe(true);
    expect(isReadOnlyMode({ JAMF_READ_ONLY: '' })).toBe(true);
    expect(isReadOnlyMode({ JAMF_READ_ONLY: 'no' })).toBe(true);
  });

  it('allows writes only with an explicit JAMF_READ_ONLY=false', () => {
    expect(isReadOnlyMode({ JAMF_READ_ONLY: 'false' })).toBe(false);
  });
});

describe('JamfApiClientHybrid read-only default', () => {
  const credentials = { baseUrl: 'https://example.jamfcloud.com', clientId: 'id', clientSecret: 'secret' };

  it('blocks writes when readOnlyMode is not specified', async () => {
    const client = new JamfApiClientHybrid(credentials);
    await expect(client.executePolicy('1', ['1'])).rejects.toThrow('read-only mode');
  });
});
