import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { orgType, placeType } from './types';
import { foldCityCountry, foldPlace } from './lib';
import { fileEventPlace, fileEventPlaces, placesMailParser } from './filing';
import { placesAiTools, placesFilingTools } from './aiTools';

export * from './types';
export * from './kinds';
export * from './lib';
export { fileEventPlace, fileEventPlaces, parseLocation, parseTable, orgForSender, placesMailParser } from './filing';
export { placeInfo, placesBeen, placesNear } from './aiTools';

export const placesModule: ModuleManifest = {
  id: 'places',
  name: 'Places & organisations',
  version: '1.1.0',
  description: 'Where you go and who you deal with: homes, cities, cafés, turfs, shops, banks and payees.',
  icon: 'location',
  color: placeType.color!,
  objects: [placeType, orgType],
  aiTools: placesAiTools,
  filingTools: placesFilingTools,
  filing: { parsers: [placesMailParser] },
  onStart: (os) => {
    // R3, once: city and country text become parent Places; events filed before R3 get their Place.
    if (!os.settings.get<boolean>('places.foldedR3', false)) {
      foldCityCountry(os);
      fileEventPlaces(os);
      os.settings.set('places.foldedR3', true);
    }
    // An event with a location (calendar, booking mail, a dump) is linked at its Place.
    bus.on('entity.created', ({ entity }) => {
      if (entity.object === 'event') fileEventPlace(os, entity);
      // Turf venues arrive with their maps link in notes.
      if (entity.object === 'place') foldPlace(os, entity as never);
    });
    bus.on('entity.updated', ({ entity, changed }) => {
      if (entity.object === 'event' && changed.includes('data.location')) fileEventPlace(os, entity);
    });
  },
};
