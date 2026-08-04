import { defineEditorMessages } from "../messages";

export const errorsMessages = defineEditorMessages("errors", {
  "Cannot create a MAGE2 project in \"{projectDir}\": the target directory must be empty.": {
    fr: "Impossible de créer un projet MAGE2 dans « {projectDir} » : le dossier cible doit être vide.", es: "No se puede crear un proyecto MAGE2 en «{projectDir}»: la carpeta de destino debe estar vacía.", "zh-Hans": "无法在“{projectDir}”中创建 MAGE2 项目：目标文件夹必须为空。", ja: "「{projectDir}」に MAGE2 プロジェクトを作成できません。対象フォルダーは空である必要があります。", ko: "‘{projectDir}’에 MAGE2 프로젝트를 만들 수 없습니다. 대상 폴더가 비어 있어야 합니다.", ar: "لا يمكن إنشاء مشروع MAGE2 في «{projectDir}»: يجب أن يكون المجلد الهدف فارغا."
  },
  "Cannot use \"{projectDir}\" as a project directory because it is not a directory.": {
    fr: "Impossible d’utiliser « {projectDir} » comme dossier de projet, car il ne s’agit pas d’un dossier.", es: "No se puede usar «{projectDir}» como carpeta de proyecto porque no es una carpeta.", "zh-Hans": "无法将“{projectDir}”用作项目文件夹，因为它不是文件夹。", ja: "「{projectDir}」はフォルダーではないため、プロジェクトフォルダーとして使用できません。", ko: "‘{projectDir}’은(는) 폴더가 아니므로 프로젝트 폴더로 사용할 수 없습니다.", ar: "لا يمكن استخدام «{projectDir}» كمجلد مشروع لأنه ليس مجلدا."
  },
  "Project save failed and its automatic rollback could not complete. Recovery will be retried before the next project operation.": {
    fr: "L’enregistrement du projet a échoué et son annulation automatique n’a pas pu aboutir. La récupération sera retentée avant la prochaine opération sur le projet.", es: "El guardado del proyecto falló y no se pudo completar la reversión automática. Se volverá a intentar la recuperación antes de la próxima operación del proyecto.", "zh-Hans": "项目保存失败，自动回滚也未能完成。将在下次项目操作前重试恢复。", ja: "プロジェクトの保存に失敗し、自動ロールバックも完了できませんでした。次のプロジェクト操作の前に復元を再試行します。", ko: "프로젝트 저장에 실패했고 자동 롤백도 완료할 수 없습니다. 다음 프로젝트 작업 전에 복구를 다시 시도합니다.", ar: "فشل حفظ المشروع ولم يكتمل التراجع التلقائي. ستتم إعادة محاولة الاسترداد قبل عملية المشروع التالية."
  },
  "The pending project save journal is invalid.": {
    fr: "Le journal de sauvegarde du projet en attente n’est pas valide.", es: "El registro del guardado de proyecto pendiente no es válido.", "zh-Hans": "待处理的项目保存日志无效。", ja: "保留中のプロジェクト保存ジャーナルが無効です。", ko: "보류 중인 프로젝트 저장 저널이 올바르지 않습니다.", ar: "سجل حفظ المشروع المعلق غير صالح."
  },
  "The pending project save journal is incomplete.": {
    fr: "Le journal de sauvegarde du projet en attente est incomplet.", es: "El registro del guardado de proyecto pendiente está incompleto.", "zh-Hans": "待处理的项目保存日志不完整。", ja: "保留中のプロジェクト保存ジャーナルが不完全です。", ko: "보류 중인 프로젝트 저장 저널이 불완전합니다.", ar: "سجل حفظ المشروع المعلق غير مكتمل."
  },
  "A directory path is required.": {
    fr: "Un chemin de dossier est requis.", es: "Se requiere una ruta de carpeta.", "zh-Hans": "需要提供文件夹路径。", ja: "フォルダーのパスが必要です。", ko: "폴더 경로가 필요합니다.", ar: "مسار المجلد مطلوب."
  },
  "\"{directoryPath}\" is not a directory.": {
    fr: "« {directoryPath} » n’est pas un dossier.", es: "«{directoryPath}» no es una carpeta.", "zh-Hans": "“{directoryPath}”不是文件夹。", ja: "「{directoryPath}」はフォルダーではありません。", ko: "‘{directoryPath}’은(는) 폴더가 아닙니다.", ar: "«{directoryPath}» ليس مجلدا."
  },
  "Folder name cannot be empty.": {
    fr: "Le nom du dossier ne peut pas être vide.", es: "El nombre de la carpeta no puede estar vacío.", "zh-Hans": "文件夹名称不能为空。", ja: "フォルダー名を空にすることはできません。", ko: "폴더 이름은 비워 둘 수 없습니다.", ar: "لا يمكن أن يكون اسم المجلد فارغا."
  },
  "Folder name is not valid.": {
    fr: "Le nom du dossier n’est pas valide.", es: "El nombre de la carpeta no es válido.", "zh-Hans": "文件夹名称无效。", ja: "フォルダー名が無効です。", ko: "폴더 이름이 올바르지 않습니다.", ar: "اسم المجلد غير صالح."
  },
  "Folder names cannot contain path separators.": {
    fr: "Les noms de dossiers ne peuvent pas contenir de séparateurs de chemin.", es: "Los nombres de carpeta no pueden contener separadores de ruta.", "zh-Hans": "文件夹名称不能包含路径分隔符。", ja: "フォルダー名にパス区切り文字を含めることはできません。", ko: "폴더 이름에는 경로 구분자를 포함할 수 없습니다.", ar: "لا يمكن أن تحتوي أسماء المجلدات على فواصل مسار."
  },
  "The requested project folder has not been granted to this editor session.": {
    fr: "L’accès au dossier de projet demandé n’a pas été accordé à cette session de l’éditeur.", es: "No se ha concedido a esta sesión del editor acceso a la carpeta de proyecto solicitada.", "zh-Hans": "当前编辑器会话尚未获得所请求项目文件夹的访问权限。", ja: "要求されたプロジェクトフォルダーへのアクセスは、このエディターセッションに許可されていません。", ko: "요청한 프로젝트 폴더에 대한 접근 권한이 이 편집기 세션에 부여되지 않았습니다.", ar: "لم يمنح هذا المحرر إذن الوصول إلى مجلد المشروع المطلوب في هذه الجلسة."
  },
  "The requested path is outside every project granted to this editor session.": {
    fr: "Le chemin demandé se trouve en dehors de tous les projets autorisés pour cette session de l’éditeur.", es: "La ruta solicitada está fuera de todos los proyectos autorizados para esta sesión del editor.", "zh-Hans": "请求的路径不在当前编辑器会话获准访问的任何项目内。", ja: "要求されたパスは、このエディターセッションに許可されたすべてのプロジェクトの外部にあります。", ko: "요청한 경로가 이 편집기 세션에 허용된 모든 프로젝트 외부에 있습니다.", ar: "يقع المسار المطلوب خارج جميع المشاريع المسموح بها لجلسة المحرر هذه."
  },
  "Media access is limited to files inside a granted project folder.": {
    fr: "L’accès aux médias est limité aux fichiers situés dans un dossier de projet autorisé.", es: "El acceso a medios se limita a archivos dentro de una carpeta de proyecto autorizada.", "zh-Hans": "媒体访问仅限于已授权项目文件夹内的文件。", ja: "メディアへのアクセスは、許可されたプロジェクトフォルダー内のファイルに限定されます。", ko: "미디어 접근은 허용된 프로젝트 폴더 안의 파일로 제한됩니다.", ar: "يقتصر الوصول إلى الوسائط على الملفات داخل مجلد مشروع مسموح به."
  },
  "Export failed while preparing the new build. The existing export was not changed. {message}": {
    fr: "L’exportation a échoué pendant la préparation de la nouvelle version. L’exportation existante n’a pas été modifiée. {message}", es: "La exportación falló al preparar la nueva compilación. La exportación existente no se modificó. {message}", "zh-Hans": "准备新构建时导出失败。现有导出未被更改。{message}", ja: "新しいビルドの準備中にエクスポートが失敗しました。既存のエクスポートは変更されていません。{message}", ko: "새 빌드를 준비하는 동안 내보내기에 실패했습니다. 기존 내보내기는 변경되지 않았습니다. {message}", ar: "فشل التصدير أثناء إعداد الإصدار الجديد. لم يتم تغيير التصدير الحالي. {message}"
  },
  "Export cannot use project folder \"{projectDir}\": {message}": {
    fr: "L’exportation ne peut pas utiliser le dossier de projet « {projectDir} » : {message}", es: "La exportación no puede usar la carpeta de proyecto «{projectDir}»: {message}", "zh-Hans": "导出无法使用项目文件夹“{projectDir}”：{message}", ja: "エクスポートではプロジェクトフォルダー「{projectDir}」を使用できません: {message}", ko: "내보내기에서 프로젝트 폴더 ‘{projectDir}’을(를) 사용할 수 없습니다: {message}", ar: "لا يمكن للتصدير استخدام مجلد المشروع «{projectDir}»: {message}"
  },
  "Export output folder must be a non-empty relative path inside the project folder.": {
    fr: "Le dossier de sortie de l’exportation doit être un chemin relatif non vide dans le dossier du projet.", es: "La carpeta de salida de la exportación debe ser una ruta relativa no vacía dentro de la carpeta del proyecto.", "zh-Hans": "导出输出文件夹必须是项目文件夹内的非空相对路径。", ja: "エクスポート出力フォルダーは、プロジェクトフォルダー内の空でない相対パスにする必要があります。", ko: "내보내기 출력 폴더는 프로젝트 폴더 안의 비어 있지 않은 상대 경로여야 합니다.", ar: "يجب أن يكون مجلد إخراج التصدير مسارا نسبيا غير فارغ داخل مجلد المشروع."
  },
  "path is not a normal directory: \"{path}\"": {
    fr: "le chemin n’est pas un dossier normal : « {path} »", es: "la ruta no es una carpeta normal: «{path}»", "zh-Hans": "路径不是普通文件夹：“{path}”", ja: "パスは通常のフォルダーではありません: 「{path}」", ko: "경로가 일반 폴더가 아닙니다: ‘{path}’", ar: "المسار ليس مجلدا عاديا: «{path}»"
  },
  "Export stopped because the {label} changed or became unsafe: {message}": {
    fr: "L’exportation s’est arrêtée, car {label} a changé ou n’est plus sûr : {message}", es: "La exportación se detuvo porque {label} cambió o dejó de ser seguro: {message}", "zh-Hans": "导出已停止，因为{label}发生变化或变得不安全：{message}", ja: "{label} が変更されたか安全でなくなったため、エクスポートを停止しました: {message}", ko: "{label}이(가) 변경되었거나 안전하지 않게 되어 내보내기가 중지되었습니다: {message}", ar: "توقف التصدير لأن {label} تغير أو أصبح غير آمن: {message}"
  },
  "Export cannot safely resolve {label} \"{path}\": {message}": {
    fr: "L’exportation ne peut pas résoudre {label} « {path} » en toute sécurité : {message}", es: "La exportación no puede resolver de forma segura {label} «{path}»: {message}", "zh-Hans": "导出无法安全解析{label}“{path}”：{message}", ja: "エクスポートでは {label}「{path}」を安全に解決できません: {message}", ko: "내보내기에서 {label} ‘{path}’을(를) 안전하게 확인할 수 없습니다: {message}", ar: "لا يمكن للتصدير حل {label} «{path}» بأمان: {message}"
  },
  "Export cannot inspect output folder \"{outputDirectory}\": {message}": {
    fr: "L’exportation ne peut pas inspecter le dossier de sortie « {outputDirectory} » : {message}", es: "La exportación no puede inspeccionar la carpeta de salida «{outputDirectory}»: {message}", "zh-Hans": "导出无法检查输出文件夹“{outputDirectory}”：{message}", ja: "エクスポートでは出力フォルダー「{outputDirectory}」を検査できません: {message}", ko: "내보내기에서 출력 폴더 ‘{outputDirectory}’을(를) 검사할 수 없습니다: {message}", ar: "لا يمكن للتصدير فحص مجلد الإخراج «{outputDirectory}»: {message}"
  },
  "Scene '{sceneId}' references missing asset '{assetId}'.": {
    fr: "La scène « {sceneId} » référence la ressource manquante « {assetId} ».", es: "La escena «{sceneId}» hace referencia al recurso que falta «{assetId}».", "zh-Hans": "场景“{sceneId}”引用了缺失的资源“{assetId}”。", ja: "シーン「{sceneId}」は存在しないアセット「{assetId}」を参照しています。", ko: "장면 ‘{sceneId}’이(가) 누락된 에셋 ‘{assetId}’을(를) 참조합니다.", ar: "يشير المشهد «{sceneId}» إلى الأصل المفقود «{assetId}»."
  },
  "The enabled title screen has no background artwork.": {
    fr: "L’écran titre activé n’a aucune illustration d’arrière-plan.", es: "La pantalla de título activada no tiene imagen de fondo.", "zh-Hans": "已启用的标题画面没有背景图。", ja: "有効なタイトル画面に背景アートがありません。", ko: "활성화된 타이틀 화면에 배경 아트가 없습니다.", ar: "لا تحتوي شاشة العنوان المفعلة على صورة خلفية."
  },
  "The creator website must be a complete http or https URL.": {
    fr: "Le site web du créateur doit être une URL http ou https complète.", es: "El sitio web del creador debe ser una URL http o https completa.", "zh-Hans": "创作者网站必须是完整的 http 或 https URL。", ja: "クリエイターのウェブサイトには、完全な http または https URL を指定してください。", ko: "제작자 웹사이트는 완전한 http 또는 https URL이어야 합니다.", ar: "يجب أن يكون موقع المنشئ عنوان URL كاملا يبدأ بـ http أو https."
  },
  "The game version must use semantic versioning, for example 1.0.0 or 1.2.0-beta.1.": {
    fr: "La version du jeu doit respecter la gestion sémantique des versions, par exemple 1.0.0 ou 1.2.0-beta.1.", es: "La versión del juego debe usar versionado semántico, por ejemplo 1.0.0 o 1.2.0-beta.1.", "zh-Hans": "游戏版本必须使用语义化版本，例如 1.0.0 或 1.2.0-beta.1。", ja: "ゲームのバージョンには、1.0.0 や 1.2.0-beta.1 などのセマンティックバージョニングを使用してください。", ko: "게임 버전은 1.0.0 또는 1.2.0-beta.1 같은 유의적 버전 규칙을 사용해야 합니다.", ar: "يجب أن يستخدم إصدار اللعبة نظام الإصدارات الدلالي، مثل 1.0.0 أو 1.2.0-beta.1."
  }
});
