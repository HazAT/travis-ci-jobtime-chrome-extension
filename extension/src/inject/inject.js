jQuery.noConflict();
(function($) {
  $(function() {
    console.log("started");

    let fetchDiffs = {};
    let totalTimeDiff = null;

    let timeout;
    let updateInterval;

    function parseUrl() {
      const pathParts = window.location.pathname.split("/");
      return {
        host: window.location.host,
        org: pathParts[1],
        repo: pathParts[2]
      };
    }

    function fetchBuilds(parsedUrl) {
      return fetch(
        `https://api.${parsedUrl.host}/repos/${parsedUrl.org}/${
          parsedUrl.repo
        }/builds`,
        {
          headers: {
            Accept: "application/vnd.travis-ci.2.1+json"
          }
        }
      ).then(response => response.json());
    }

    function fetchJobs(parsedUrl, jobIds) {
      return fetch(
        `https://api.${parsedUrl.host}/jobs?ids[]=${jobIds.join("&ids[]=")}`,
        {
          headers: {
            Accept: "application/vnd.travis-ci.2.1+json"
          }
        }
      ).then(response => response.json());
    }

    function getTrimmedMean(data, trimAmount) {
      var trimCount = Math.floor(trimAmount * data.length);
      var trimData = data.sort().slice(trimCount, data.length - trimCount);
      return trimData.reduce((a, b) => a + b, 0) / trimData.length;
    }

    function getDuration() {
      let parsedUrl = parseUrl();
      return fetchBuilds(parsedUrl)
        .then(buildResponse => {
          if (!buildResponse.builds) {
            console.error("No builds");
            return;
          }

          console.log("BUILDS:");
          console.log(buildResponse.builds);
          console.log("------------------");
          // TODO: if first build response is current build and it's "finished", skip

          let jobIds = [];
          let totalDiff = [];
          let count = 0;
          for (let i = 0; i < Math.min(5, buildResponse.builds.length); i++) {
            const build = buildResponse.builds[i];

            jobIds = jobIds.concat(build.job_ids);
            count++;
            totalDiff.push(
              moment(build.finished_at).diff(
                moment(build.started_at),
                "seconds"
              )
            );

            if (count >= 5) {
              break;
            }
          }

          console.log("total diff", getTrimmedMean(totalDiff, 0.5));
          totalTimeDiff = getTrimmedMean(totalDiff, 0.5);
          console.log(jobIds);
          return jobIds;
        })
        .then(jobIds => {
          return fetchJobs(parsedUrl, jobIds).then(jobResponse => {
            let diffs = {};
            if (!jobResponse.jobs) {
              console.error("No jobs");
              return;
            }

            console.log(jobResponse);
            for (let i = 0; i < jobResponse.jobs.length; i++) {
              const job = jobResponse.jobs[i];
              const jobNumber = job.number.match(/\.\d+/gm);
              diffs[jobNumber] = diffs[jobNumber] || [];
              diffs[jobNumber].push(
                moment(job.finished_at).diff(moment(job.started_at), "seconds")
              );
            }
            return diffs;
          });
        })
        .then(diffs => {
          let meanDiffs = {};
          Object.keys(diffs).forEach(key => {
            meanDiffs[key] = getTrimmedMean(diffs[key], 0.5);
          });
          console.log(meanDiffs);
          fetchDiffs = meanDiffs;
          return meanDiffs;
        });
    }
    getDuration();

    $("body").one("DOMNodeInserted", "li.jobs-item", function() {
      clearTimeout(timeout);
      clearInterval(updateInterval);

      timeout = setTimeout(function() {
        function update() {
          if (Object.keys(fetchDiffs).length == 0) {
            return;
          }

          // As soon as we have data, we do no longer want to poll for it
          clearInterval(updateInterval);

          // Update the total time in the job header section
          if (totalTimeDiff) {
            let totalMinutes = Math.floor(totalTimeDiff / 60);
            console.log(totalMinutes);
            let totalSeconds = totalTimeDiff - totalMinutes * 60;
            $(".commit-stopwatch")
              .find("span.ext")
              .remove();
            if (!isNaN(totalMinutes) && !isNaN(totalSeconds)) {
              let totalMins = totalMinutes > 0 ? `${totalMinutes} min ` : "";
              $(".commit-stopwatch time").append(
                `<span class='ext'> (Ø ${totalMins}${totalSeconds} sec)</span>`
              );
            }
          }

          // Add time for each job in the job list
          $("section.jobs li.jobs-item").each(function() {
            const jobNr = $(this)
              .find(".job-number span")
              .text()
              .match(/\.\d+/gm);
            $(this)
              .find(".job-duration span")
              .remove();
            let minutes = Math.floor(fetchDiffs[jobNr] / 60);
            let seconds = fetchDiffs[jobNr] - minutes * 60;
            if (!isNaN(minutes) && !isNaN(seconds)) {
              let mins = minutes > 0 ? `${minutes} min ` : "";
              $(this)
                .find(".job-duration")
                .append(`<span><br/>Ø ${mins}${seconds} sec</span>`);
            }
          });
        }
        update();
        updateInterval = setInterval(update, 1000);
      }, 100);
    });
    console.log("finished");
  });
})(jQuery);
