package app.lifeos.device

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract

/**
 * Every file under a folder picked with Android's folder picker (a SAF tree),
 * five folders deep: one query per folder, nothing copied. Hidden files
 * (".name") are skipped. Documents (R7c) keeps a record pointing at each.
 */
object FolderTree {
  private val COLUMNS = arrayOf(
    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
    DocumentsContract.Document.COLUMN_MIME_TYPE,
    DocumentsContract.Document.COLUMN_SIZE,
    DocumentsContract.Document.COLUMN_LAST_MODIFIED,
  )

  fun list(context: Context, treeUri: String, maxFiles: Int): List<Map<String, Any?>> {
    val tree = Uri.parse(treeUri.trimEnd('/'))
    val out = ArrayList<Map<String, Any?>>()

    fun walk(docId: String, path: String, depth: Int) {
      if (out.size >= maxFiles) return
      val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId)
      val folders = ArrayList<Pair<String, String>>()
      context.contentResolver.query(children, COLUMNS, null, null, null)?.use { c ->
        while (c.moveToNext() && out.size < maxFiles) {
          val id = c.getString(0) ?: continue
          val name = c.getString(1) ?: continue
          if (name.startsWith(".")) continue
          val mime = c.getString(2) ?: ""
          if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
            folders.add(id to (if (path.isEmpty()) name else "$path/$name"))
          } else {
            out.add(
              mapOf(
                "uri" to DocumentsContract.buildDocumentUriUsingTree(tree, id).toString(),
                "name" to name,
                "mime" to mime,
                "size" to (if (c.isNull(3)) 0.0 else c.getLong(3).toDouble()),
                "modified" to (if (c.isNull(4)) 0.0 else c.getLong(4).toDouble()),
                "path" to path,
              )
            )
          }
        }
      }
      if (depth < 5) for ((id, sub) in folders) walk(id, sub, depth + 1)
    }

    walk(DocumentsContract.getTreeDocumentId(tree), "", 0)
    return out
  }
}
