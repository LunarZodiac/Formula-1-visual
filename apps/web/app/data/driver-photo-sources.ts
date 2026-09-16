import driverMedia from './catalogs/driver-media.json';

const uploadedDriverPhotos = driverMedia.drivers as Record<string, string>;

const driverPhotoTokens: Record<string, string> = {
  max_verstappen: 'maxver01', lando_norris: 'lannor01', charles_leclerc: 'chalecl01',
  oscar_piastri: 'oscpia01', carlos_sainz: 'carsai01', george_russell: 'georus01',
  lewis_hamilton: 'lewham01', fernando_alonso: 'feralo01', pierre_gasly: 'piegas01',
  yuki_tsunoda: 'yuktsu01', lance_stroll: 'lanstr01', esteban_ocon: 'estoco01',
  alexander_albon: 'alealb01', oliver_bearman: 'olibea01', liam_lawson: 'lialaw01',
  andrea_kimi_antonelli: 'andant01', isack_hadjar: 'isahad01', gabriel_bortoleto: 'gabbor01',
  norris: 'lannor01', leclerc: 'chalecl01', piastri: 'oscpia01', sainz: 'carsai01',
  russell: 'georus01', hamilton: 'lewham01', alonso: 'feralo01', gasly: 'piegas01',
  tsunoda: 'yuktsu01', stroll: 'lanstr01', ocon: 'estoco01', albon: 'alealb01',
  bearman: 'olibea01', lawson: 'lialaw01', antonelli: 'andant01', hadjar: 'isahad01',
  bortoleto: 'gabbor01',
};

export function driverPhotoUrl(driverId: string | null | undefined, width = 640) {
  const uploadedPhoto = driverId ? uploadedDriverPhotos[driverId] : null;
  if (uploadedPhoto) return uploadedPhoto;
  const token = driverId ? driverPhotoTokens[driverId] : null;
  return token
    ? `https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_${width}/content/dam/fom-website/2018-redesign-assets/drivers/2025/${token}.png`
    : null;
}
