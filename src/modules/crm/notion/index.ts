import type { SourceDef } from '@core/registry/types';
import { NOTION_TOKEN, SOURCE_ID, sendNotion, syncNotion } from './sync';

/**
 * Notion as a Source of crm (docs/MODEL.md layer 4, *Notion: your People CRM,
 * kept in step*; R2b): a `readings` source that also writes, the Turf web
 * pattern. Token in the phone's secure store (You › Data sources › Notion),
 * the copy it writes to in settings (`crm.notion.dataSource`, default
 * 📇 Personal CRM (1)). The cursor is Notion's last_edited_time, kept by the
 * module; core's time-based `since` is not used. Changes made here go first.
 */
export const notionSource: SourceDef = {
  id: SOURCE_ID,
  label: 'Notion',
  modules: ['crm'],
  permission: 'Notion token',
  kind: 'readings',
  available: async (os) => !!(await os.device?.secrets?.get(NOTION_TOKEN)),
  sync: async (os) => {
    const r = await syncNotion(os);
    return { filed: r.created + r.updated, cursor: String(Date.now()) };
  },
  send: (os, items) => sendNotion(os, items),
};

export {
  NotionClient, NotionError, WriteRefused, ORIGINAL, COPY, ORIGINAL_REFUSAL, isOriginal, normId, notionTiming, NOTION_VERSION, NOTION_BASE,
  type NotionPage, type NotionBlock, type NotionDataSource,
} from './client';
export {
  NOTION_TOKEN, SOURCE_ID as NOTION_SOURCE, SETTING_TARGET as NOTION_TARGET, SETTING_TARGET_NAME as NOTION_TARGET_NAME, SETTING_CURSOR as NOTION_CURSOR, SETTING_SNAP as NOTION_SNAP, SETTING_ASKED as NOTION_ASKED, SETTING_LAST as NOTION_LAST,
  FILING_MATCH as NOTION_MATCH, FILING_CONFLICT as NOTION_CONFLICT,
  isNotionToken, notionTarget, notionTargetName, notionLast, notionSnap, notionClient, setNotionTarget, resolveNotionLink,
  queuePerson as queueNotion, listenForNotion, answerNotionMatch, takeOtherValue as takeOtherNotionValue, conflictOf as notionConflictOf, matchAskOf as notionMatchOf,
  conflictLabel as notionConflictLabel, syncNotion, sendNotion, fromNotion,
  type NotionSnap, type NotionSyncResult,
} from './sync';
export { KEY_LABEL as NOTION_FIELD_LABEL, NEW_PROPERTIES as NOTION_NEW_PROPERTIES, PROP as NOTION_PROP, type Key as NotionKey } from './mapping';
