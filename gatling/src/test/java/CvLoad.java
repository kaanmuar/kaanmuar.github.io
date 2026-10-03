import static io.gatling.javaapi.core.CoreDsl.atOnceUsers;
import static io.gatling.javaapi.core.CoreDsl.exec;
import static io.gatling.javaapi.core.CoreDsl.global;
import static io.gatling.javaapi.core.CoreDsl.scenario;
import static io.gatling.javaapi.core.CoreDsl.substring;
import static io.gatling.javaapi.http.HttpDsl.http;
import static io.gatling.javaapi.http.HttpDsl.status;

import io.gatling.javaapi.core.ScenarioBuilder;
import io.gatling.javaapi.core.Simulation;
import io.gatling.javaapi.http.HttpProtocolBuilder;
import java.time.Duration;

public class CvLoad extends Simulation {
  {
    String base = System.getProperty("baseUrl", "http://127.0.0.1:8767");
    if (!base.matches("https?://(127\\.0\\.0\\.1|localhost)(:\\d+)?/?")) {
      throw new IllegalArgumentException("This load test only runs against the local static server");
    }
    HttpProtocolBuilder protocol = http.baseUrl(base.replaceAll("/$", ""));
    ScenarioBuilder pages = scenario("pages").forever().on(
      exec(http("PERF-01").get("/").check(status().is(200), substring("Carlos Muñoz")))
        .exec(http("PERF-02").get("/qa-lab.html").check(status().is(200), substring("The suite I run on this CV")))
        .exec(http("PERF-03").get("/simulador.html").check(status().is(200), substring("Run 4-agent sprint")))
        .exec(http("PERF-04").get("/style.css").check(status().is(200), substring("tailwindcss")))
        .exec(http("PERF-04").get("/js/cv-app.js").check(status().is(200), substring("initializeApp")))
        .pause(Duration.ofMillis(300))
    );
    setUp(pages.injectOpen(atOnceUsers(8)))
      .protocols(protocol)
      .maxDuration(Duration.ofSeconds(20))
      .assertions(
        global().failedRequests().percent().lt(1.0),
        global().responseTime().percentile(95.0).lt(2500)
      );
  }
}
