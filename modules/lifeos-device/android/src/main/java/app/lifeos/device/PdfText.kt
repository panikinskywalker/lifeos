package app.lifeos.device

import android.content.Context
import android.net.Uri
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File

/**
 * The text of a PDF shared into LifeOS (PdfBox-Android), rows in reading
 * order so a table comes out one line per row. Empty for a scan, which has
 * pictures and no text.
 */
object PdfText {
  fun read(context: Context, uri: String): String {
    PDFBoxResourceLoader.init(context.applicationContext)
    val input = if (uri.startsWith("content:") || uri.startsWith("file:")) context.contentResolver.openInputStream(Uri.parse(uri)) else File(uri).inputStream()
    return (input ?: throw IllegalArgumentException("cannot open $uri")).use { stream ->
      PDDocument.load(stream).use { doc -> PDFTextStripper().apply { setSortByPosition(true) }.getText(doc) }
    }
  }
}
