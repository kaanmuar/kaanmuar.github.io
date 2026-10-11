import static io.gatling.javaapi.core.CoreDsl.atOnceUsers;
import static io.gatling.javaapi.core.CoreDsl.exec;
import static io.gatling.javaapi.core.CoreDsl.global;
import static io.gatling.javaapi.core.CoreDsl.scenario;
import static io.gatling.javaapi.core.CoreDsl.substring;
import static io.gatling.javaapi.http.HttpDsl.http;
import static io.gatling.javaapi.http.HttpDsl.status;

import io.gatling.javaapi.core.ChainBuilder;
import io.gatling.javaapi.core.ScenarioBuilder;
import io.gatling.javaapi.core.Simulation;
import io.gatling.javaapi.http.HttpProtocolBuilder;
import java.time.Duration;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class CvLoad extends Simulation {
  private ChainBuilder hit(ChainBuilder chain, String id, String path, String marker) {
    return chain.exec(http(id).get(path).check(status().is(200), substring(marker)));
  }

  {
    String base = System.getProperty("baseUrl", "http://127.0.0.1:8767");
    if (!base.matches("https?://(127\\.0\\.0\\.1|localhost)(:\\d+)?/?")) {
      throw new IllegalArgumentException("This load test only runs against the local static server");
    }
    String raw = System.getProperty("catalogIds", "").trim();
    Set<String> wanted = new HashSet<>();
    if (!raw.isEmpty()) wanted.addAll(Arrays.asList(raw.split(",")));
    HttpProtocolBuilder protocol = http.baseUrl(base.replaceAll("/$", ""));
    ChainBuilder chain = exec(session -> session);
    if (wanted.isEmpty() || wanted.contains("PERF-01")) chain = hit(chain, "PERF-01", "/", "Carlos Muñoz");
    if (wanted.isEmpty() || wanted.contains("PERF-02")) chain = hit(chain, "PERF-02", "/qa-lab.html", "The suite I run on this CV");
    if (wanted.isEmpty() || wanted.contains("PERF-03")) chain = hit(chain, "PERF-03", "/simulador.html", "Run 4-agent sprint");
    if (wanted.isEmpty() || wanted.contains("PERF-04")) {
      chain = hit(chain, "PERF-04", "/style.css", "tailwindcss");
      chain = hit(chain, "PERF-04", "/js/cv-app.js", "initializeApp");
    }
    if (wanted.isEmpty() || wanted.contains("PERF-05")) chain = hit(chain, "PERF-05", "/favicon.svg", "Carlos Muñoz CV");
    if (wanted.isEmpty() || wanted.contains("PERF-06")) {
      chain = hit(chain, "PERF-06", "/css/cv.css", ".trademark");
      chain = hit(chain, "PERF-06", "/css/site-look.css", "html[data-look]");
    }
    if (wanted.isEmpty() || wanted.contains("PERF-07")) {
      chain = hit(chain, "PERF-07", "/robots.txt", "User-agent");
      chain = hit(chain, "PERF-07", "/sitemap.xml", "carlosandmunoz.com");
    }
    if (wanted.isEmpty() || wanted.contains("PERF-08")) {
      chain = hit(chain, "PERF-08", "/js/qa-lab.js", "Run with");
      chain = hit(chain, "PERF-08", "/js/site-look.js", "Golden Gate");
    }
    ScenarioBuilder pages = scenario("pages").forever().on(chain.pause(Duration.ofMillis(300)));
    setUp(pages.injectOpen(atOnceUsers(8)))
      .protocols(protocol)
      .maxDuration(Duration.ofSeconds(20))
      .assertions(
        global().failedRequests().percent().lt(1.0),
        global().responseTime().percentile(95.0).lt(2500)
      );
  }
}
