import type { YesNo } from '@/core/intents/yesNo';
import {
  PROMPT_YES_OR_NO,
  REPLY_CALL_CANCELLED,
  REPLY_CALL_CONFIRMED,
  REPLY_NO_CONTACTS,
  REPLY_NO_NAME,
  runCallFlow,
  type CallFlowPorts,
} from '@/core/system/callFlow';
import type { Contact } from '@/core/system/contactMatch';

const c = (id: string, name: string): Contact => ({ id, name });

const CONTACTS = [c('1', 'Kuya Ben'), c('2', 'Ate Rose'), c('3', 'Jun Santos'), c('4', 'Jun Cruz')];

function makePorts(answers: (YesNo | Error)[], contacts: readonly Contact[] = CONTACTS) {
  const queue = [...answers];
  const prompts: string[] = [];
  const ports: CallFlowPorts = {
    getContacts: jest.fn(async () => contacts),
    confirm: jest.fn(async (prompt: string) => {
      prompts.push(prompt);
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next ?? 'unknown';
    }),
  };
  return { ports, prompts };
}

describe('runCallFlow', () => {
  it('reads the name back and dials only after yes', async () => {
    const { ports, prompts } = makePorts(['yes']);
    const result = await runCallFlow('kuya ben', ports);
    expect(prompts).toEqual(['Calling Kuya Ben, okay?']);
    expect(result).toEqual({ reply: REPLY_CALL_CONFIRMED, dial: CONTACTS[0] });
  });

  it('cancels on no', async () => {
    const { ports } = makePorts(['no']);
    expect(await runCallFlow('Ben', ports)).toEqual({ reply: REPLY_CALL_CANCELLED, dial: null });
  });

  it('asks once more after an unclear answer, then dials on yes', async () => {
    const { ports, prompts } = makePorts(['unknown', 'yes']);
    const result = await runCallFlow('Ben', ports);
    expect(prompts).toEqual(['Calling Kuya Ben, okay?', PROMPT_YES_OR_NO]);
    expect(result.dial).toEqual(CONTACTS[0]);
  });

  it('cancels after two unclear answers', async () => {
    const { ports } = makePorts(['unknown', 'unknown']);
    expect(await runCallFlow('Ben', ports)).toEqual({ reply: REPLY_CALL_CANCELLED, dial: null });
    expect(ports.confirm).toHaveBeenCalledTimes(2);
  });

  it('does not accept a "no" on the retry as a yes', async () => {
    const { ports } = makePorts(['unknown', 'no']);
    expect((await runCallFlow('Ben', ports)).dial).toBeNull();
  });

  it('never dials when listening fails', async () => {
    const { ports } = makePorts([new Error('mic busy'), new Error('mic busy')]);
    expect(await runCallFlow('Ben', ports)).toEqual({ reply: REPLY_CALL_CANCELLED, dial: null });
  });

  it('never guesses between tied contacts and does not ask for confirmation', async () => {
    const { ports } = makePorts(['yes']);
    const result = await runCallFlow('Jun', ports);
    expect(result).toEqual({ reply: 'I found Jun Santos or Jun Cruz. Please say the full name', dial: null });
    expect(ports.confirm).not.toHaveBeenCalled();
  });

  it('names at most three tied contacts', async () => {
    const many = [c('1', 'Jun Santos'), c('2', 'Jun Cruz'), c('3', 'Jun Reyes'), c('4', 'Jun Lim')];
    const { ports } = makePorts([], many);
    const result = await runCallFlow('Jun', ports);
    expect(result.reply).toBe('I found Jun Santos, Jun Cruz or Jun Reyes. Please say the full name');
  });

  it('says so when the name is not in the contacts', async () => {
    const { ports } = makePorts(['yes']);
    const result = await runCallFlow('Pedro', ports);
    expect(result).toEqual({ reply: "I can't find Pedro in your contacts", dial: null });
    expect(ports.confirm).not.toHaveBeenCalled();
  });

  it('declines a missing or blank name without touching contacts', async () => {
    for (const target of [null, '', '   ']) {
      const { ports } = makePorts(['yes']);
      expect(await runCallFlow(target, ports)).toEqual({ reply: REPLY_NO_NAME, dial: null });
      expect(ports.getContacts).not.toHaveBeenCalled();
    }
  });

  it('handles empty or unreadable contacts', async () => {
    const empty = makePorts(['yes'], []);
    expect(await runCallFlow('Ben', empty.ports)).toEqual({ reply: REPLY_NO_CONTACTS, dial: null });

    const failing = makePorts(['yes']);
    failing.ports.getContacts = jest.fn(async () => {
      throw new Error('permission denied');
    });
    expect(await runCallFlow('Ben', failing.ports)).toEqual({ reply: REPLY_NO_CONTACTS, dial: null });
    expect(failing.ports.confirm).not.toHaveBeenCalled();
  });
});
