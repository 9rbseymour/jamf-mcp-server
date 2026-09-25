import { jest } from '@jest/globals';
import { JamfApiClientHybrid } from '../jamf-client-hybrid.js';
import { executePolicy as executePolicySkill } from '../tools/tool-implementations.js';

const MANAGEMENT_ID = 'aaaaaaaa-3f1e-4b3a-a5b3-ca0cd7430937';

function makeClient() {
  const client = new JamfApiClientHybrid({
    baseUrl: 'https://example.jamfcloud.com',
    clientId: 'id',
    clientSecret: 'secret',
    readOnlyMode: false,
  });
  const http = {
    get: jest.fn(async () => ({ data: {} })),
    post: jest.fn(async () => ({ data: {}, headers: {} })),
    put: jest.fn(async () => ({ data: {} })),
    delete: jest.fn(async () => ({ data: {} })),
  };
  const anyClient = client as any;
  anyClient.axiosInstance = http;
  anyClient.ensureAuthenticated = jest.fn(async () => undefined);
  anyClient.getComputerDetails = jest.fn(async () => ({ general: { managementId: MANAGEMENT_ID } }));
  anyClient.getMobileDeviceDetails = jest.fn(async () => ({ managementId: MANAGEMENT_ID }));
  return { client, http, anyClient };
}

function postedPaths(http: { post: jest.Mock }) {
  return http.post.mock.calls.map((call) => call[0]);
}

describe('policy and script execution (no Jamf API exists)', () => {
  it('executePolicy fails with an explanation and makes no API call', async () => {
    const { client, http } = makeClient();
    await expect(client.executePolicy('1', ['2'])).rejects.toThrow(/no API/i);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('deployScript fails with an explanation and makes no API call', async () => {
    const { client, http } = makeClient();
    await expect(client.deployScript('1', ['2'])).rejects.toThrow(/no API/i);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('executePolicy skill passes device IDs as an array', async () => {
    const { client, anyClient } = makeClient();
    anyClient.executePolicy = jest.fn(async () => undefined);
    await executePolicySkill(client, { policyId: '1', deviceIds: ['42'], confirm: true });
    expect(anyClient.executePolicy).toHaveBeenCalledWith('1', ['42']);
  });
});

describe('sendComputerMDMCommand', () => {
  it('sends DeviceLock via /v2/mdm/commands using the management ID', async () => {
    const { client, http } = makeClient();
    await client.sendComputerMDMCommand('5', 'DeviceLock');
    expect(http.post).toHaveBeenCalledWith('/api/v2/mdm/commands', {
      clientData: [{ managementId: MANAGEMENT_ID }],
      commandData: { commandType: 'DEVICE_LOCK' },
    });
  });

  it('uses a management ID passed directly without a lookup', async () => {
    const { client, http, anyClient } = makeClient();
    await client.sendComputerMDMCommand(MANAGEMENT_ID, 'RestartDevice');
    expect(anyClient.getComputerDetails).not.toHaveBeenCalled();
    expect(http.post).toHaveBeenCalledWith('/api/v2/mdm/commands', {
      clientData: [{ managementId: MANAGEMENT_ID }],
      commandData: { commandType: 'RESTART_DEVICE' },
    });
  });

  it('maps UpdateInventory to DEVICE_INFORMATION', async () => {
    const { client, http } = makeClient();
    await client.sendComputerMDMCommand('5', 'UpdateInventory');
    expect(http.post).toHaveBeenCalledWith('/api/v2/mdm/commands', {
      clientData: [{ managementId: MANAGEMENT_ID }],
      commandData: { commandType: 'DEVICE_INFORMATION' },
    });
  });

  it('sends UnmanageDevice via the v4 remove-mdm-profile endpoint', async () => {
    const { client, http } = makeClient();
    await client.sendComputerMDMCommand('5', 'UnmanageDevice');
    expect(postedPaths(http)).toEqual(['/api/v4/computers-inventory/5/remove-mdm-profile']);
  });

  it('fails loudly when the computer has no management ID', async () => {
    const { client, http, anyClient } = makeClient();
    anyClient.getComputerDetails = jest.fn(async () => ({ general: {} }));
    await expect(client.sendComputerMDMCommand('5', 'DeviceLock')).rejects.toThrow(/management ID/);
    expect(http.post).not.toHaveBeenCalled();
  });
});

describe('updateInventory (computer)', () => {
  it('sends DEVICE_INFORMATION instead of redeploying the management framework', async () => {
    const { client, http } = makeClient();
    await client.updateInventory('5');
    expect(postedPaths(http)).toEqual(['/api/v2/mdm/commands']);
    expect(http.post.mock.calls[0][1]).toEqual({
      clientData: [{ managementId: MANAGEMENT_ID }],
      commandData: { commandType: 'DEVICE_INFORMATION' },
    });
  });
});

describe('sendMDMCommand (mobile device)', () => {
  it('sends DeviceLock via /v2/mdm/commands', async () => {
    const { client, http } = makeClient();
    await client.sendMDMCommand('7', 'DeviceLock');
    expect(http.post).toHaveBeenCalledWith('/api/v2/mdm/commands', {
      clientData: [{ managementId: MANAGEMENT_ID }],
      commandData: { commandType: 'DEVICE_LOCK' },
    });
  });

  it('sends Bluetooth and roaming toggles as SETTINGS commands', async () => {
    const { client, http } = makeClient();
    await client.sendMDMCommand('7', 'SettingsDisableBluetooth');
    await client.sendMDMCommand('7', 'SettingsEnableDataRoaming');
    expect(http.post.mock.calls.map((call) => (call[1] as any).commandData)).toEqual([
      { commandType: 'SETTINGS', bluetooth: false },
      { commandType: 'SETTINGS', dataRoaming: 'ENABLE_DATA_ROAMING' },
    ]);
  });

  it('sends ClearPasscode through the Classic API URL form', async () => {
    const { client, http } = makeClient();
    await client.sendMDMCommand('7', 'ClearPasscode');
    expect(postedPaths(http)).toEqual(['/JSSResource/mobiledevicecommands/command/ClearPasscode/id/7']);
  });

  it('rejects WiFi toggles, which no Jamf API supports', async () => {
    const { client, http } = makeClient();
    await expect(client.sendMDMCommand('7', 'SettingsEnableWiFi')).rejects.toThrow(/Invalid MDM command/);
    expect(http.post).not.toHaveBeenCalled();
  });
});

describe('endpoints that only exist in the Classic API', () => {
  it('updateMobileDeviceInventory calls only the Classic UpdateInventory command', async () => {
    const { client, http } = makeClient();
    await client.updateMobileDeviceInventory('7');
    expect(postedPaths(http)).toEqual(['/JSSResource/mobiledevicecommands/command/UpdateInventory/id/7']);
  });

  it('deleteComputerGroup calls only the Classic API', async () => {
    const { client, http } = makeClient();
    await client.deleteComputerGroup('9');
    expect(http.delete.mock.calls.map((call) => call[0])).toEqual(['/JSSResource/computergroups/id/9']);
  });

  it('createPolicy and updatePolicy skip the nonexistent /api/v1/policies endpoint', async () => {
    const { client, http } = makeClient();
    await client.createPolicy({ general: { name: 'p' } });
    await client.updatePolicy('3', { general: { name: 'p' } });
    const paths = [...postedPaths(http), ...http.put.mock.calls.map((call) => call[0])];
    expect(paths.some((p) => String(p).startsWith('/api/v1/policies'))).toBe(false);
  });
});
