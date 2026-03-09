def search_verses(query, verses, limit=5):

    query = query.lower()
    results = []

    for verse in verses:
        if query in verse["english"].lower():
            results.append(verse)

    return results[:limit]