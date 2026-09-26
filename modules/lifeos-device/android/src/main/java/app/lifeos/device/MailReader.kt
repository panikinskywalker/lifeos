package app.lifeos.device

import com.sun.mail.imap.IMAPFolder
import java.util.Date
import java.util.Properties
import javax.mail.AuthenticationFailedException
import javax.mail.FetchProfile
import javax.mail.Folder
import javax.mail.Message
import javax.mail.Multipart
import javax.mail.Part
import javax.mail.Session
import javax.mail.Store
import javax.mail.UIDFolder
import javax.mail.internet.InternetAddress
import javax.mail.search.ComparisonTerm
import javax.mail.search.ReceivedDateTerm

/**
 * Gmail over IMAP with an app password (M4.2b). Read-only: folders are
 * opened READ_ONLY, nothing is marked, moved or deleted. Two steps so that
 * only mail worth reading is downloaded: headers first (the app decides),
 * then the text of the chosen ones. The password is used for the call and
 * never stored or logged here.
 */
object MailReader {
  private const val HOST = "imap.gmail.com"
  private const val MAX_TEXT = 20_000

  private fun connect(email: String, password: String): Store {
    val props = Properties().apply {
      put("mail.store.protocol", "imaps")
      put("mail.imaps.host", HOST)
      put("mail.imaps.port", "993")
      put("mail.imaps.ssl.enable", "true")
      put("mail.imaps.ssl.checkserveridentity", "true")
      put("mail.imaps.connectiontimeout", "20000")
      put("mail.imaps.timeout", "60000")
      put("mail.imaps.partialfetch", "false")
    }
    val store = Session.getInstance(props).getStore("imaps")
    try {
      store.connect(HOST, email, password.replace(" ", ""))
    } catch (e: AuthenticationFailedException) {
      throw IllegalStateException("AUTH: ${e.message ?: "sign-in refused"}")
    }
    return store
  }

  /** "All Mail" (every label, archived too) — found by its \All flag so it works in any Gmail language; else the inbox. */
  private fun allMail(store: Store): IMAPFolder {
    val all = store.defaultFolder.list("*").firstOrNull { f -> (f as? IMAPFolder)?.attributes?.any { it.equals("\\All", ignoreCase = true) } == true }
    val folder = (all ?: store.getFolder("INBOX")) as IMAPFolder
    folder.open(Folder.READ_ONLY)
    return folder
  }

  /** Sign in and out: "ok", or throws with AUTH: … when the password is refused. */
  fun check(email: String, password: String): String {
    val store = connect(email, password)
    try {
      allMail(store).close(false)
    } finally {
      store.close()
    }
    return "ok"
  }

  /**
   * Headers of mail after `afterUid` (or, the first time / after a mailbox
   * reset, since `sinceMs`), newest last, at most `max`. Returns the folder's
   * UIDVALIDITY so the app knows when stored UIDs stop meaning anything.
   */
  fun headers(email: String, password: String, sinceMs: Long, afterUid: Long, uidValidity: Long, max: Int): Map<String, Any?> {
    val store = connect(email, password)
    try {
      val folder = allMail(store)
      try {
        val validity = folder.uidValidity
        val msgs: Array<Message> =
          if (afterUid > 0 && validity == uidValidity) folder.getMessagesByUID(afterUid + 1, UIDFolder.LASTUID).filterNotNull().toTypedArray()
          else folder.search(ReceivedDateTerm(ComparisonTerm.GE, Date(sinceMs)))
        val recent = if (msgs.size > max) msgs.copyOfRange(msgs.size - max, msgs.size) else msgs
        val fp = FetchProfile().apply {
          add(FetchProfile.Item.ENVELOPE)
          add(UIDFolder.FetchProfileItem.UID)
        }
        folder.fetch(recent, fp)
        val out = ArrayList<Map<String, Any?>>()
        for (m in recent) {
          val uid = folder.getUID(m)
          if (uid <= afterUid && validity == uidValidity) continue
          val from = m.from?.firstOrNull() as? InternetAddress
          out.add(
            mapOf(
              "uid" to uid.toDouble(),
              "from" to (from?.address ?: ""),
              "fromName" to (from?.personal ?: ""),
              "subject" to (m.subject ?: ""),
              "date" to ((m.sentDate ?: m.receivedDate)?.time ?: 0L).toDouble(),
            ),
          )
        }
        return mapOf("uidValidity" to validity.toDouble(), "total" to msgs.size.toDouble(), "headers" to out)
      } finally {
        folder.close(false)
      }
    } finally {
      store.close()
    }
  }

  /** The text of these messages (plain text preferred; HTML flattened), capped in length. */
  fun bodies(email: String, password: String, uids: List<Double>): List<Map<String, Any?>> {
    val store = connect(email, password)
    try {
      val folder = allMail(store)
      try {
        val out = ArrayList<Map<String, Any?>>()
        val msgs = folder.getMessagesByUID(uids.map { it.toLong() }.toLongArray())
        for (m in msgs) {
          if (m == null) continue
          val text = try { textOf(m) } catch (e: Exception) { "" }
          out.add(mapOf("uid" to folder.getUID(m).toDouble(), "text" to text.take(MAX_TEXT)))
        }
        return out
      } finally {
        folder.close(false)
      }
    } finally {
      store.close()
    }
  }

  private fun textOf(p: Part): String {
    if (p.isMimeType("text/plain")) return (p.content as? String) ?: ""
    if (p.isMimeType("text/html")) return flatten((p.content as? String) ?: "")
    if (p.isMimeType("multipart/alternative")) {
      val mp = p.content as Multipart
      var html: String? = null
      for (i in 0 until mp.count) {
        val part = mp.getBodyPart(i)
        if (part.isMimeType("text/plain")) {
          val t = (part.content as? String) ?: ""
          if (t.isNotBlank()) return t
        }
        if (part.isMimeType("text/html")) html = (part.content as? String)
        else if (part.isMimeType("multipart/*")) return textOf(part)
      }
      return html?.let { flatten(it) } ?: ""
    }
    if (p.isMimeType("multipart/*")) {
      val mp = p.content as Multipart
      val sb = StringBuilder()
      for (i in 0 until mp.count) {
        val part = mp.getBodyPart(i)
        if (Part.ATTACHMENT.equals(part.disposition, ignoreCase = true)) continue
        sb.append(textOf(part)).append('\n')
        if (sb.length > MAX_TEXT) break
      }
      return sb.toString()
    }
    return ""
  }

  /** HTML → readable lines: blocks become line breaks, tags and styles go, entities decode. */
  private fun flatten(html: String): String =
    html
      .replace(Regex("(?is)<(script|style|head)[^>]*>.*?</\\1>"), " ")
      .replace(Regex("(?i)<br\\s*/?>|</(p|div|tr|li|h[1-6]|table)>"), "\n")
      .replace(Regex("(?i)</t[dh]>"), "  ")
      .replace(Regex("<[^>]+>"), " ")
      .replace("&nbsp;", " ")
      .replace("&amp;", "&")
      .replace("&lt;", "<")
      .replace("&gt;", ">")
      .replace("&quot;", "\"")
      .replace("&#39;", "'")
      .replace("&#8377;", "₹")
      .replace("&rsquo;", "’")
      .replace(Regex("&#(\\d+);")) { m -> m.groupValues[1].toIntOrNull()?.let { String(Character.toChars(it)) } ?: "" }
      .replace(Regex("[ \\t\\x0B\\f\\r]+"), " ")
      .replace(Regex("\\n\\s*\\n+"), "\n")
      .trim()
}
