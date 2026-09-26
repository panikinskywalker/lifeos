package app.lifeos.device

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Messages that arrive while the app isn't running (an SMS, a payment
 * notification) wait here until JS drains them. Capped so a busy phone
 * can't grow it without bound.
 */
object Inbox {
  private const val PREFS = "lifeos_device_inbox"
  private const val MAX = 500

  /** Set by the module while JS is alive, so new items are pushed at once. */
  @Volatile var listener: ((String, Map<String, Any?>) -> Unit)? = null

  @Synchronized
  fun add(context: Context, queue: String, item: Map<String, Any?>) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val arr = JSONArray(prefs.getString(queue, "[]"))
    arr.put(JSONObject(item))
    val trimmed = if (arr.length() > MAX) JSONArray().also { out -> for (i in arr.length() - MAX until arr.length()) out.put(arr.get(i)) } else arr
    prefs.edit().putString(queue, trimmed.toString()).apply()
    listener?.invoke(queue, item)
  }

  @Synchronized
  fun drain(context: Context, queue: String): List<Map<String, Any?>> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val arr = JSONArray(prefs.getString(queue, "[]"))
    prefs.edit().putString(queue, "[]").apply()
    val out = ArrayList<Map<String, Any?>>(arr.length())
    for (i in 0 until arr.length()) {
      val o = arr.getJSONObject(i)
      val m = HashMap<String, Any?>()
      for (k in o.keys()) m[k] = o.get(k)
      out.add(m)
    }
    return out
  }

  fun getStringSet(context: Context, key: String): Set<String> =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet(key, emptySet()) ?: emptySet()

  fun putStringSet(context: Context, key: String, values: Set<String>) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putStringSet(key, values).apply()
  }
}
