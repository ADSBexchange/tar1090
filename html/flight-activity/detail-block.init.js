jQuery(document).ready(function () {
    jQuery(document).tooltip();
    if (usp.has('icao')) {
        let icao = usp.get('icao');

        runAPI(icao, true, jQuery('#container'), function (data) {
            let apiReturn = data; // Do something with the data when it is ready
            display_general(apiReturn, jQuery('#plane_information'), jQuery("#registration_header"));
            display_takeoffs_landings_full_details(apiReturn, jQuery('#takeoff_landings_block'));
            displayPicture(data, jQuery('#airplane_picture'))
            displayMoreDetails(jQuery('#more_details'));
            jQuery('.loadingContainer').attr("style", "display:none;")
            $(document).attr("title", "Aircraft and Flight Details for " + icao);
        });
    }
});