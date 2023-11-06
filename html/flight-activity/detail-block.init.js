jQuery(document).ready(function () {
    jQuery(document).tooltip();

    if (usp.has('icao')) {
        let icao = usp.get('icao');
        const icaorange = findICAORange(icao); //This is a function from the flags.js file. It returns the country and range for the icao.
        const fillingGlobalCache = parent.returnGlobalCache();
        const planespottingAPI = parent.setPlaneSpottingAPI();
        const planespottersAPI = parent.setPlaneSpottersAPI();
        runAPI(icao, true, jQuery('#container'), function (data) {
            let apiReturn = data; // Do something with the data when it is ready
            display_general(apiReturn, jQuery('#plane_information'), jQuery("#registration_header"), icaorange?.country, fillingGlobalCache);
            display_takeoffs_landings_full_details(apiReturn, jQuery('#takeoff_landings_block'));
            displayPicture(data, jQuery('#airplane_picture'), planespottingAPI, planespottersAPI)
            displayMoreDetails(jQuery('#more_details'));
            jQuery('.loadingContainer').attr("style", "display:none;")
            $(document).attr("title", "Aircraft and Flight Details for " + icao);
        });
    }
});