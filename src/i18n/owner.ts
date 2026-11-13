import type { Bundle } from './types';
const ru = {
  'owner.title': 'Защита от удаления',
  'owner.protected': 'Device Owner включён. Android запрещает удаление «Контроль ДЗ».',
  'owner.notManaged': 'На этом телефоне нет защиты от удаления.',
  'owner.error': 'Device Owner включён, но запрет удаления не подтверждён. Покажите телефон родителю.',
  'owner.setup': 'Режим настраивает родитель через USB с компьютера. Это не обычное разрешение: Android может потребовать новый или сброшенный телефон без аккаунтов. Не сбрасывайте телефон и не удаляйте аккаунты ради настройки без резервной копии и решения родителя.',
  'owner.release': 'Для снятия управления нужен компьютер родителя с разрешённой USB-отладкой. Отключение экранного времени не снимает Device Owner.',
  'owner.limit': 'Режим защищает установку приложения. Доступ к статистике, показ поверх приложений и геолокация настраиваются отдельно.',
};
const en: typeof ru = {
  'owner.title': 'Uninstall protection',
  'owner.protected': 'Device Owner is active. Android prevents uninstalling Kontrol DZ.',
  'owner.notManaged': 'This phone has no uninstall protection.',
  'owner.error': 'Device Owner is active, but the uninstall block is not confirmed. Show this phone to your parent.',
  'owner.setup': 'A parent sets up this mode over USB using a computer. This is not a normal permission: Android may require a new or reset phone without accounts. Do not reset the phone or remove accounts without a backup and your parent’s decision.',
  'owner.release': 'Removing management requires the parent’s computer with authorized USB debugging. Turning off screen time does not remove Device Owner.',
  'owner.limit': 'This mode protects the app installation. Usage access, display over other apps and location are configured separately.',
};
const kk: typeof ru = {
  'owner.title': 'Жоюдан қорғау',
  'owner.protected': 'Device Owner қосылған. Android «Контроль ДЗ» қолданбасын жоюға тыйым салады.',
  'owner.notManaged': 'Бұл телефонда жоюдан қорғау жоқ.',
  'owner.error': 'Device Owner қосылған, бірақ жоюға тыйым расталмады. Телефонды ата-анаңызға көрсетіңіз.',
  'owner.setup': 'Бұл режимді ата-ана компьютерден USB арқылы баптайды. Бұл кәдімгі рұқсат емес: Android аккаунттары жоқ жаңа немесе бастапқы күйге қайтарылған телефонды талап етуі мүмкін. Сақтық көшірмесіз және ата-ананың шешімінсіз телефонды қалпына келтірмеңіз, аккаунттарды жоймаңыз.',
  'owner.release': 'Басқаруды алып тастау үшін USB арқылы жөндеуге рұқсаты бар ата-ананың компьютері қажет. Экран уақытын өшіру Device Owner режимін алып тастамайды.',
  'owner.limit': 'Режим қолданбаның орнатылуын қорғайды. Пайдалану статистикасы, басқа қолданбалардың үстінен көрсету және геолокация бөлек бапталады.',
};
export default { ru, en, kk } satisfies Bundle;
